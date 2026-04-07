import { supabase } from "./supabaseClient";

type VerifyTelegramIdentityResponse = {
  session_token?: string;
  expires_at?: string;
  telegram_id?: number;
  error?: string;
};

export async function verifyTelegramIdentity(initData: string) {
  const normalizedInitData = initData.trim();
  if (!normalizedInitData) {
    throw new Error("INIT_DATA_REQUIRED");
  }

  const { data, error } = await supabase.functions.invoke<VerifyTelegramIdentityResponse>(
    "tg_verify_telegram_identity",
    {
      body: {
        initData: normalizedInitData,
      },
    },
  );

  if (error) {
    throw new Error(error.message || "TELEGRAM_IDENTITY_VERIFY_FAILED");
  }

  const sessionToken = String(data?.session_token ?? "").trim();
  const expiresAt = String(data?.expires_at ?? "").trim();
  const telegramId = Number(data?.telegram_id);
  if (!sessionToken || !expiresAt || !Number.isInteger(telegramId) || telegramId <= 0) {
    throw new Error("INVALID_TELEGRAM_IDENTITY_RESPONSE");
  }

  return {
    sessionToken,
    expiresAt,
    telegramId,
  };
}
