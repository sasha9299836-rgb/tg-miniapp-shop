import { supabase } from "./supabaseClient";
import { ensureAdminRuntimeReady } from "../auth/adminRuntimeReadiness";
import { getCdekProxyBaseUrl } from "./cdekProxyBase";

export type YcPresignPutPayload = {
  post_id: string;
  item_id?: number | null;
  photo_no: number;
  content_type?: string;
  ext?: string;
  kind?: "main" | "defect";
};

export type YcPresignResponse = {
  url: string;
  key: string;
  publicUrl: string;
};

type YcDeleteObjectResponse = {
  ok: boolean;
};

type MainPhotoUploadViaProxyResponse = {
  ok?: boolean;
  key?: string;
  url?: string;
  photo_no?: number;
  error?: string;
  message?: string;
  details?: unknown;
};

export type MainUploadDebugEvent = {
  step:
    | "prepare"
    | "compression_start"
    | "compression_done"
    | "compression_failed"
    | "fetch_start"
    | "fetch_failed_before_response"
    | "response_received"
    | "response_text_received"
    | "response_json_parse_failed"
    | "response_not_ok"
    | "response_ok";
  at: string;
  data?: Record<string, unknown>;
};

const MAIN_UPLOAD_TARGET_MAX_BYTES = 2.5 * 1024 * 1024;
const MAIN_UPLOAD_PNG_PASSTHROUGH_MAX_BYTES = 5 * 1024 * 1024;
const MAIN_UPLOAD_MAX_WIDTH = 1600;
const MAIN_UPLOAD_QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6] as const;

function readAdminToken(): string {
  try {
    return (window.localStorage.getItem("tg_admin_session_token") ?? "").trim();
  } catch {
    return "";
  }
}

function buildAdminSessionHeaders(): Record<string, string> | undefined {
  const token = readAdminToken();
  if (!token) return undefined;
  return { "x-admin-token": token };
}

function inferExtensionFromFileName(fileName: string): string | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]{2,8})$/u)?.[1]?.trim() ?? "";
  if (!ext) return null;
  if (ext === "jpeg") return "jpg";
  return ext;
}

function normalizeUploadContentType(file: File, extFromName: string | null): string {
  const rawType = String(file.type ?? "").trim().toLowerCase();
  if (extFromName === "mov") return "video/quicktime";
  if (extFromName === "mp4") return "video/mp4";
  if (extFromName === "jpg") return "image/jpeg";
  if (extFromName === "png") return "image/png";
  if (extFromName === "webp") return "image/webp";
  return rawType || "application/octet-stream";
}

export async function ycPresignPut(payload: YcPresignPutPayload): Promise<YcPresignResponse> {
  await ensureAdminRuntimeReady();
  const { data, error } = await supabase.functions.invoke<YcPresignResponse>("yc_presign_put", {
    body: payload,
    headers: buildAdminSessionHeaders(),
  });

  if (error) throw error;
  if (!data?.url || !data?.key || !data?.publicUrl) {
    throw new Error("yc_presign_put returned an invalid response");
  }

  return data;
}

export async function getYcPresignedPut(
  post_id: string,
  item_id: number | null,
  file: File,
  photo_no: number,
  kind: "main" | "defect" = "main",
): Promise<YcPresignResponse> {
  const extFromName = inferExtensionFromFileName(file.name);
  const normalizedContentType = normalizeUploadContentType(file, extFromName);
  console.debug("[ycApi] presign payload", {
    post_id,
    item_id,
    photo_no,
    kind,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    extFromName,
    normalizedContentType,
  });

  return ycPresignPut({
    post_id,
    item_id,
    photo_no,
    content_type: normalizedContentType,
    ext: extFromName ?? undefined,
    kind,
  });
}

export async function deleteYcObject(storageKey: string): Promise<void> {
  const key = String(storageKey ?? "").trim();
  if (!key) {
    throw new Error("Empty storage key for delete");
  }

  console.debug("[ycApi] delete payload", { key });
  await ensureAdminRuntimeReady();

  const { data, error } = await supabase.functions.invoke<YcDeleteObjectResponse>("yc_delete_object", {
    body: { key },
    headers: buildAdminSessionHeaders(),
  });

  if (error) throw error;
  if (!data?.ok) {
    throw new Error("Failed to delete object from storage");
  }
}

function stripExifCanvasOrientation(_canvas: HTMLCanvasElement): void {
  // No-op placeholder to keep future extension point explicit.
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("CANVAS_TO_BLOB_FAILED"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

async function loadImageForCompression(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressMainUploadImage(
  originalFile: File,
  emitDebug: (step: MainUploadDebugEvent["step"], data?: MainUploadDebugEvent["data"]) => void,
): Promise<{ file: File; usedQuality: number | null; compressed: boolean }> {
  const mime = String(originalFile.type ?? "").toLowerCase();
  if (!mime.startsWith("image/")) {
    return { file: originalFile, usedQuality: null, compressed: false };
  }

  if (mime === "image/png" && originalFile.size <= MAIN_UPLOAD_PNG_PASSTHROUGH_MAX_BYTES) {
    emitDebug("compression_done", {
      skipped: true,
      reason: "PNG_SMALL_ENOUGH",
      original_size: originalFile.size,
      compressed_size: originalFile.size,
      quality: null,
    });
    return { file: originalFile, usedQuality: null, compressed: false };
  }

  emitDebug("compression_start", {
    original_size: originalFile.size,
    file_type: originalFile.type || "unknown",
    file_name: originalFile.name,
    target_max_bytes: MAIN_UPLOAD_TARGET_MAX_BYTES,
    max_width: MAIN_UPLOAD_MAX_WIDTH,
  });

  const image = await loadImageForCompression(originalFile);
  const sourceWidth = Math.max(1, Math.floor(image.naturalWidth || image.width || 1));
  const sourceHeight = Math.max(1, Math.floor(image.naturalHeight || image.height || 1));
  const targetWidth = Math.min(sourceWidth, MAIN_UPLOAD_MAX_WIDTH);
  const targetHeight = Math.max(1, Math.round(sourceHeight * (targetWidth / sourceWidth)));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  stripExifCanvasOrientation(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  }
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  let bestBlob: Blob | null = null;
  let bestQuality: number | null = null;
  for (const quality of MAIN_UPLOAD_QUALITY_STEPS) {
    const blob = await canvasToJpegBlob(canvas, quality);
    bestBlob = blob;
    bestQuality = quality;
    if (blob.size <= MAIN_UPLOAD_TARGET_MAX_BYTES) break;
  }

  if (!bestBlob) {
    throw new Error("COMPRESS_RESULT_EMPTY");
  }

  if (bestBlob.size >= originalFile.size) {
    emitDebug("compression_done", {
      skipped: true,
      reason: "NO_SIZE_GAIN",
      original_size: originalFile.size,
      compressed_size: bestBlob.size,
      quality: bestQuality,
      width: targetWidth,
      height: targetHeight,
    });
    return { file: originalFile, usedQuality: null, compressed: false };
  }

  const compressedFile = new File([bestBlob], originalFile.name, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  emitDebug("compression_done", {
    skipped: false,
    original_size: originalFile.size,
    compressed_size: compressedFile.size,
    quality: bestQuality,
    width: targetWidth,
    height: targetHeight,
    target_achieved: compressedFile.size <= MAIN_UPLOAD_TARGET_MAX_BYTES,
  });

  return { file: compressedFile, usedQuality: bestQuality, compressed: true };
}

export async function uploadMainPhotoViaProxy(
  post_id: string,
  item_id: number | null,
  file: File,
  photo_no: number,
  onDebug?: (event: MainUploadDebugEvent) => void,
): Promise<{ key: string; url: string; photo_no: number }> {
  const emitDebug = (
    step: MainUploadDebugEvent["step"],
    data?: MainUploadDebugEvent["data"],
  ) => {
    onDebug?.({
      step,
      at: new Date().toISOString(),
      data,
    });
  };

  await ensureAdminRuntimeReady();
  const token = readAdminToken();
  if (!token) {
    emitDebug("prepare", {
      error: "ADMIN_TOKEN_MISSING",
      token_present: false,
      token_length: 0,
    });
    throw new Error("ADMIN_TOKEN_MISSING");
  }

  const base = getCdekProxyBaseUrl();
  const endpoint = `${base}/api/admin/media/main/upload`;
  let fileForUpload = file;
  let compressionQuality: number | null = null;
  try {
    const compressionResult = await compressMainUploadImage(file, emitDebug);
    fileForUpload = compressionResult.file;
    compressionQuality = compressionResult.usedQuality;
  } catch (error) {
    emitDebug("compression_failed", {
      original_size: file.size,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : null,
    });
    fileForUpload = file;
    compressionQuality = null;
  }

  console.debug("[ycApi][main-upload] prepare", {
    endpoint,
    token_present: Boolean(token),
    token_length: token.length,
    post_id,
    item_id,
    photo_no,
    file_name: fileForUpload.name,
    file_type: fileForUpload.type,
    file_size: fileForUpload.size,
    original_file_size: file.size,
    compression_quality: compressionQuality,
  });
  emitDebug("prepare", {
    endpoint,
    token_present: true,
    token_length: token.length,
    post_id,
    item_id,
    photo_no,
    file_name: fileForUpload.name,
    file_type: fileForUpload.type || "unknown",
    file_size: fileForUpload.size,
    original_file_size: file.size,
    compression_quality: compressionQuality,
  });
  const formData = new FormData();
  formData.append("post_id", post_id);
  formData.append("photo_no", String(photo_no));
  if (item_id != null) {
    formData.append("item_id", String(item_id));
  }
  formData.append("file", fileForUpload);

  console.log("FORMDATA CHECK", {
    hasFile: formData.has("file"),
    fileSize: fileForUpload.size,
  });

  let response: Response;
  try {
    console.debug("[ycApi][main-upload] fetch start");
    emitDebug("fetch_start", {
      endpoint,
      method: "POST",
      has_file: true,
      field_post_id: post_id,
      field_photo_no: photo_no,
      field_item_id: item_id,
      auth_header_bearer: true,
      transport: "fetch",
    });

    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch (error) {
    const normalizedError = new Error("NETWORK_ERROR");
    console.error("[ycApi][main-upload] fetch failed before response", {
      endpoint,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : null,
    });
    emitDebug("fetch_failed_before_response", {
      endpoint,
      message: normalizedError.message,
      name: normalizedError.name,
      original_message: error instanceof Error ? error.message : String(error),
      original_name: error instanceof Error ? error.name : null,
      stack: error instanceof Error ? error.stack ?? null : null,
      transport: "fetch",
    });
    throw normalizedError;
  }

  const status = response.status;
  const isOk = response.ok;
  console.debug("[ycApi][main-upload] response received", {
    status,
    ok: isOk,
    content_type: "unknown",
  });
  emitDebug("response_received", {
    status,
    ok: isOk,
    content_type: "unknown",
  });
  const text = await response.text().catch(() => "");
  console.debug("[ycApi][main-upload] response text preview", {
    status,
    preview: text.slice(0, 500),
  });
  emitDebug("response_text_received", {
    status,
    text_preview: text.slice(0, 500),
    text_length: text.length,
  });
  let data: MainPhotoUploadViaProxyResponse | null = null;
  try {
    data = text ? (JSON.parse(text) as MainPhotoUploadViaProxyResponse) : null;
  } catch {
    console.warn("[ycApi][main-upload] response json parse failed", { status });
    emitDebug("response_json_parse_failed", {
      status,
      text_preview: text.slice(0, 500),
    });
    data = null;
  }

  if (!isOk) {
    const message = data?.error ?? data?.message ?? `HTTP_${status}`;
    const details = data?.details ? `: ${JSON.stringify(data.details)}` : "";
    emitDebug("response_not_ok", {
      status,
      message,
      details: data?.details ?? null,
    });
    throw new Error(`MAIN_UPLOAD_FAILED ${message}${details}`);
  }

  if (!data?.ok || !data.key || !data.url || !Number.isFinite(Number(data.photo_no))) {
    emitDebug("response_not_ok", {
      status,
      message: "MAIN_UPLOAD_INVALID_RESPONSE",
      details: {
        ok: data?.ok ?? null,
        has_key: Boolean(data?.key),
        has_url: Boolean(data?.url),
        photo_no: data?.photo_no ?? null,
      },
    });
    throw new Error("MAIN_UPLOAD_INVALID_RESPONSE");
  }

  emitDebug("response_ok", {
    status,
    key: data.key,
    url: data.url,
    photo_no: Number(data.photo_no),
  });
  return {
    key: data.key,
    url: data.url,
    photo_no: Number(data.photo_no),
  };
}
