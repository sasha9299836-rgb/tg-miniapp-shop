import { supabase } from "./supabaseClient";
import { TG_IDENTITY_REQUIRED_ERROR } from "../auth/tgUser";
import { getTgDebugHeaders, setLastCollectionsErrorCode } from "../debug/tgDebug";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";

export type UserFavoriteRow = {
  post_id: string;
  created_at: string;
};

export type UserCartRow = {
  post_id: string;
  created_at: string;
};

type AddResult = "ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD";

async function buildTelegramUserSessionHeaders(): Promise<Record<string, string>> {
  const token = await ensureTelegramUserSessionToken();
  console.log("[user-collections] session header build", { hasToken: Boolean(token) });
  if (!token) throw new Error(TG_IDENTITY_REQUIRED_ERROR);
  return { "x-tg-user-session": token, ...getTgDebugHeaders() };
}

export async function listUserFavorites(): Promise<UserFavoriteRow[]> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; rows?: UserFavoriteRow[] }>(
    "tg_user_collections_secure",
    {
      body: { scope: "favorites", action: "list" },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_LOAD_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_LOAD_FAILED");
  setLastCollectionsErrorCode(null);
  return data.rows ?? [];
}

export async function addUserFavorite(postId: string): Promise<AddResult> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; result?: string }>(
    "tg_user_collections_secure",
    {
      body: { scope: "favorites", action: "add", post_id: postId },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_ADD_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_ADD_FAILED");
  setLastCollectionsErrorCode(null);
  return String(data.result ?? "BAD_PAYLOAD") as AddResult;
}

export async function removeUserFavorite(postId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    "tg_user_collections_secure",
    {
      body: { scope: "favorites", action: "remove", post_id: postId },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_REMOVE_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_REMOVE_FAILED");
  setLastCollectionsErrorCode(null);
}

export async function clearUserFavorites(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    "tg_user_collections_secure",
    {
      body: { scope: "favorites", action: "clear" },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_CLEAR_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_CLEAR_FAILED");
  setLastCollectionsErrorCode(null);
}

export async function listUserCart(): Promise<UserCartRow[]> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; rows?: UserCartRow[] }>(
    "tg_user_collections_secure",
    {
      body: { scope: "cart", action: "list" },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_LOAD_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_LOAD_FAILED");
  setLastCollectionsErrorCode(null);
  return data.rows ?? [];
}

export async function addUserCartItem(postId: string): Promise<AddResult> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; result?: string }>(
    "tg_user_collections_secure",
    {
      body: { scope: "cart", action: "add", post_id: postId },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_ADD_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_ADD_FAILED");
  setLastCollectionsErrorCode(null);
  return String(data.result ?? "BAD_PAYLOAD") as AddResult;
}

export async function removeUserCartItem(postId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    "tg_user_collections_secure",
    {
      body: { scope: "cart", action: "remove", post_id: postId },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_REMOVE_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_REMOVE_FAILED");
  setLastCollectionsErrorCode(null);
}

export async function clearUserCart(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    "tg_user_collections_secure",
    {
      body: { scope: "cart", action: "clear" },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) {
    setLastCollectionsErrorCode(error.message ?? "COLLECTION_CLEAR_FAILED");
    throw error;
  }
  if (!data?.ok) throw new Error("COLLECTION_CLEAR_FAILED");
  setLastCollectionsErrorCode(null);
}
