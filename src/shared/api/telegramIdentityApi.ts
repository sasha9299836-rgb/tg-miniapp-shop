import { supabase } from "./supabaseClient";

type VerifyTelegramIdentityResponse = {
  session_token?: string;
  expires_at?: string;
  expires_in?: number;
  telegram_id?: number;
  error?: string;
  reason?: string;
};

export async function verifyTelegramIdentity(initData: string) {
  const normalizedInitData = initData.trim();
  if (!normalizedInitData) {
    throw new Error("INIT_DATA_REQUIRED");
  }

  console.log("[tg-identity-verify] request", {
    initDataLength: normalizedInitData.length,
    hasTelegramRuntime: Boolean(window.Telegram?.WebApp),
  });

  const { data, error } = await supabase.functions.invoke<VerifyTelegramIdentityResponse>(
    "tg_verify_telegram_identity",
    {
      body: {
        initData: normalizedInitData,
      },
    },
  );

  if (error) {
    console.log("[tg-identity-verify] failed", {
      message: error.message ?? null,
      status: (error as { context?: { status?: number } }).context?.status ?? null,
    });
    throw new Error(error.message || "TELEGRAM_IDENTITY_VERIFY_FAILED");
  }

  const sessionToken = String(data?.session_token ?? "").trim();
  const expiresAt = String(data?.expires_at ?? "").trim();
  const expiresIn = Number(data?.expires_in ?? 0);
  const telegramId = Number(data?.telegram_id);
  if (!sessionToken || !expiresAt || !Number.isInteger(telegramId) || telegramId <= 0) {
    console.log("[tg-identity-verify] invalid response", {
      hasSessionToken: Boolean(sessionToken),
      hasExpiresAt: Boolean(expiresAt),
      expiresIn,
      telegramId: Number.isFinite(telegramId) ? telegramId : null,
      error: data?.error ?? null,
      reason: data?.reason ?? null,
    });
    throw new Error("INVALID_TELEGRAM_IDENTITY_RESPONSE");
  }

  console.log("[tg-identity-verify] success", {
    telegramId,
    expiresIn,
  });

  return {
    sessionToken,
    expiresAt,
    expiresIn,
    telegramId,
  };
}
