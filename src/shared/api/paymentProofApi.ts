import { supabase } from "./supabaseClient";

const TG_ADMIN_SESSION_TOKEN_KEY = "tg_admin_session_token";

export async function getPaymentProofPutPresign(payload: {
  order_id: string;
  tg_user_id: number;
  file_name: string;
  content_type: string;
}): Promise<{ url: string; key: string }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; key?: string }>(
    "tg_yc_presign_payment_proof_put",
    { body: payload },
  );
  if (error) throw error;
  if (!data?.url || !data?.key) throw new Error("PRESIGN_PUT_FAILED");
  return { url: data.url, key: data.key };
}

export async function getPaymentProofGetPresign(orderId: string): Promise<{ url: string }> {
  const adminToken = window.localStorage.getItem(TG_ADMIN_SESSION_TOKEN_KEY) ?? "";
  const { data, error } = await supabase.functions.invoke<{ url?: string }>(
    "tg_yc_presign_payment_proof_get",
    {
      body: { order_id: orderId },
      headers: adminToken
        ? {
            "x-admin-token": adminToken,
          }
        : undefined,
    },
  );
  if (error) throw error;
  if (!data?.url) throw new Error("PRESIGN_GET_FAILED");
  return { url: data.url };
}
