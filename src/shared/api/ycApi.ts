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
  const fileForUpload = file;

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
    original_file_type: file.type || "unknown",
    using_original_file: true,
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
    original_file_type: file.type || "unknown",
    using_original_file: true,
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

export async function uploadMeasurementPhotoViaProxy(
  post_id: string,
  file: File,
  photo_no: number,
): Promise<{ key: string; url: string; photo_no: number }> {
  await ensureAdminRuntimeReady();
  const token = readAdminToken();
  if (!token) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }

  const base = getCdekProxyBaseUrl();
  const endpoint = `${base}/api/admin/media/main/upload`;
  const formData = new FormData();
  formData.append("post_id", post_id);
  formData.append("photo_no", String(photo_no));
  formData.append("kind", "measurement");
  formData.append("file", file);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`MEASUREMENT_UPLOAD_FAILED ${response.status} ${text}`.trim());
  }

  const data = (await response.json().catch(() => null)) as MainPhotoUploadViaProxyResponse | null;
  if (!data?.ok || !data.key || !data.url || !Number.isFinite(Number(data.photo_no))) {
    throw new Error("MEASUREMENT_UPLOAD_INVALID_RESPONSE");
  }

  return {
    key: data.key,
    url: data.url,
    photo_no: Number(data.photo_no),
  };
}
