import { supabase } from "./supabaseClient";

export type UserFavoriteRow = {
  post_id: string;
  created_at: string;
};

export type UserCartRow = {
  post_id: string;
  created_at: string;
};

export async function listUserFavorites(tgUserId: number): Promise<UserFavoriteRow[]> {
  const { data, error } = await supabase
    .from("tg_user_favorites")
    .select("post_id, created_at")
    .eq("tg_user_id", tgUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as UserFavoriteRow[]) ?? [];
}

export async function addUserFavorite(tgUserId: number, postId: string): Promise<"ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD"> {
  const { data, error } = await supabase.rpc("tg_user_favorites_add", {
    p_tg_user_id: tgUserId,
    p_post_id: postId,
  });
  if (error) throw error;
  return String(data ?? "BAD_PAYLOAD") as "ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD";
}

export async function removeUserFavorite(tgUserId: number, postId: string): Promise<void> {
  const { error } = await supabase
    .from("tg_user_favorites")
    .delete()
    .eq("tg_user_id", tgUserId)
    .eq("post_id", postId);
  if (error) throw error;
}

export async function clearUserFavorites(tgUserId: number): Promise<void> {
  const { error } = await supabase
    .from("tg_user_favorites")
    .delete()
    .eq("tg_user_id", tgUserId);
  if (error) throw error;
}

export async function listUserCart(tgUserId: number): Promise<UserCartRow[]> {
  const { data, error } = await supabase
    .from("tg_user_cart")
    .select("post_id, created_at")
    .eq("tg_user_id", tgUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as UserCartRow[]) ?? [];
}

export async function addUserCartItem(tgUserId: number, postId: string): Promise<"ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD"> {
  const { data, error } = await supabase.rpc("tg_user_cart_add", {
    p_tg_user_id: tgUserId,
    p_post_id: postId,
  });
  if (error) throw error;
  return String(data ?? "BAD_PAYLOAD") as "ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD";
}

export async function removeUserCartItem(tgUserId: number, postId: string): Promise<void> {
  const { error } = await supabase
    .from("tg_user_cart")
    .delete()
    .eq("tg_user_id", tgUserId)
    .eq("post_id", postId);
  if (error) throw error;
}

export async function clearUserCart(tgUserId: number): Promise<void> {
  const { error } = await supabase
    .from("tg_user_cart")
    .delete()
    .eq("tg_user_id", tgUserId);
  if (error) throw error;
}
