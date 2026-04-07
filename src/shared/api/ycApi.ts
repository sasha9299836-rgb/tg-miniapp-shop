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

export async function ycPresignPut(payload: YcPresignPutPayload): Promise<YcPresignResponse> {
  const { data, error } = await supabase.functions.invoke<YcPresignResponse>("yc_presign_put", {
    body: payload,
    headers: buildAdminSessionHeaders(),
  });

  if (error) throw error;
  if (!data?.url || !data?.key || !data?.publicUrl) {
    throw new Error("yc_presign_put вернул некорректный ответ");
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
  const extFromName = file.name.toLowerCase().match(/\.([a-z0-9]{2,8})$/u)?.[1];
  return ycPresignPut({
    post_id,
    item_id,
    photo_no,
    content_type: file.type || "application/octet-stream",
    ext: extFromName,
    kind,
  });
}

export async function deleteYcObject(storageKey: string): Promise<void> {
  const key = String(storageKey ?? "").trim();
  if (!key) {
    throw new Error("Пустой storage key для удаления файла.");
  }

  const { data, error } = await supabase.functions.invoke<YcDeleteObjectResponse>("yc_delete_object", {
    body: { key },
    headers: buildAdminSessionHeaders(),
  });

  if (error) throw error;
  if (!data?.ok) {
    throw new Error("Не удалось удалить файл из хранилища.");
  }
}
