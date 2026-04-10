import { supabase } from "./supabaseClient";

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

  const { data, error } = await supabase.functions.invoke<YcDeleteObjectResponse>("yc_delete_object", {
    body: { key },
    headers: buildAdminSessionHeaders(),
  });

  if (error) throw error;
  if (!data?.ok) {
    throw new Error("Failed to delete object from storage");
  }
}
