import { supabase } from "./supabaseClient";
import { TG_IDENTITY_REQUIRED_ERROR } from "../auth/tgUser";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";

const TG_ADMIN_SESSION_TOKEN_KEY = "tg_admin_session_token";

export async function getPaymentProofPutPresign(payload: {
  order_id: string;
  file_name: string;
  content_type: string;
}): Promise<{ url: string; key: string }> {
  const userSessionToken = await readTelegramUserSessionToken();
  if (!userSessionToken) {
    throw new Error(TG_IDENTITY_REQUIRED_ERROR);
  }
  const { data, error } = await supabase.functions.invoke<{ url?: string; key?: string }>(
    "tg_yc_presign_payment_proof_put",
    {
      body: payload,
      headers: {
        "x-tg-user-session": userSessionToken,
      },
    },
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

async function readTelegramUserSessionToken() {
  return ensureTelegramUserSessionToken();
}
