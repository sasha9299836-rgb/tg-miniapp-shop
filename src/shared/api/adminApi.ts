import { supabase } from "./supabaseClient";

type AdminLoginResponse = {
  session_token?: string;
  expires_at?: string;
  token?: string;
  ok?: boolean;
};

type AdminMeResponse = {
  is_admin?: boolean;
  ok?: boolean;
};

function parseErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybeStatus = (error as { context?: { status?: number }; status?: number }).context?.status ??
    (error as { status?: number }).status;
  return typeof maybeStatus === "number" ? maybeStatus : null;
}

export async function adminLogin(code: string): Promise<{ session_token: string; expires_at: string }> {
  const { data, error } = await supabase.functions.invoke<AdminLoginResponse>("admin_login", {
    body: { code },
  });

  if (error) {
    const status = parseErrorStatus(error);
    if (status === 401) {
      throw new Error("INVALID_CODE");
    }
    throw new Error("LOGIN_FAILED");
  }

  const sessionToken = data?.session_token ?? data?.token;
  const expiresAt = data?.expires_at;
  if (!sessionToken || !expiresAt) {
    throw new Error("LOGIN_FAILED");
  }

  return { session_token: sessionToken, expires_at: expiresAt };
}

export async function adminMe(session_token: string): Promise<{ is_admin: boolean }> {
  const { data, error } = await supabase.functions.invoke<AdminMeResponse>("me", {
    headers: {
      "x-admin-token": session_token,
    },
  });

  if (error) {
    return { is_admin: false };
  }

  return { is_admin: Boolean(data?.is_admin) };
}
