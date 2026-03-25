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

export async function ycPresignPut(payload: YcPresignPutPayload): Promise<YcPresignResponse> {
  const { data, error } = await supabase.functions.invoke<YcPresignResponse>("yc_presign_put", {
    body: payload,
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
