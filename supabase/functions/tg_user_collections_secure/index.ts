import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type Scope = "favorites" | "cart";
type Action = "list" | "add" | "remove" | "clear";

type RequestBody = {
  scope?: Scope;
  action?: Action;
  post_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    console.log(JSON.stringify({
      scope: "tg_user_collections_secure",
      event: "request_received",
      hasSessionHeader: Boolean((req.headers.get("x-tg-user-session") ?? "").trim()),
    }));
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;
    console.log(JSON.stringify({
      scope: "tg_user_collections_secure",
      event: "session_resolved",
      tgUserId: userSession.tgUserId,
    }));

    const body = await req.json().catch(() => null) as RequestBody | null;
    const scope = String(body?.scope ?? "").trim() as Scope;
    const action = String(body?.action ?? "").trim() as Action;
    const postId = String(body?.post_id ?? "").trim();

    if (scope === "favorites" && action === "list") {
      const { data, error } = await supabase
        .from("tg_user_favorites")
        .select("post_id, created_at")
        .eq("tg_user_id", userSession.tgUserId)
        .order("created_at", { ascending: false });
      if (error) return json({ error: "COLLECTION_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action, rows: data ?? [] });
    }

    if (scope === "favorites" && action === "add") {
      if (!postId) return json({ error: "BAD_PAYLOAD" }, 400);
      const { data, error } = await supabase.rpc("tg_user_favorites_add", {
        p_tg_user_id: userSession.tgUserId,
        p_post_id: postId,
      });
      if (error) return json({ error: "COLLECTION_ADD_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action, result: String(data ?? "BAD_PAYLOAD") });
    }

    if (scope === "favorites" && action === "remove") {
      if (!postId) return json({ error: "BAD_PAYLOAD" }, 400);
      const { error } = await supabase
        .from("tg_user_favorites")
        .delete()
        .eq("tg_user_id", userSession.tgUserId)
        .eq("post_id", postId);
      if (error) return json({ error: "COLLECTION_REMOVE_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action });
    }

    if (scope === "favorites" && action === "clear") {
      const { error } = await supabase
        .from("tg_user_favorites")
        .delete()
        .eq("tg_user_id", userSession.tgUserId);
      if (error) return json({ error: "COLLECTION_CLEAR_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action });
    }

    if (scope === "cart" && action === "list") {
      const { data, error } = await supabase
        .from("tg_user_cart")
        .select("post_id, created_at")
        .eq("tg_user_id", userSession.tgUserId)
        .order("created_at", { ascending: false });
      if (error) return json({ error: "COLLECTION_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action, rows: data ?? [] });
    }

    if (scope === "cart" && action === "add") {
      if (!postId) return json({ error: "BAD_PAYLOAD" }, 400);
      const { data, error } = await supabase.rpc("tg_user_cart_add", {
        p_tg_user_id: userSession.tgUserId,
        p_post_id: postId,
      });
      if (error) return json({ error: "COLLECTION_ADD_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action, result: String(data ?? "BAD_PAYLOAD") });
    }

    if (scope === "cart" && action === "remove") {
      if (!postId) return json({ error: "BAD_PAYLOAD" }, 400);
      const { error } = await supabase
        .from("tg_user_cart")
        .delete()
        .eq("tg_user_id", userSession.tgUserId)
        .eq("post_id", postId);
      if (error) return json({ error: "COLLECTION_REMOVE_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action });
    }

    if (scope === "cart" && action === "clear") {
      const { error } = await supabase
        .from("tg_user_cart")
        .delete()
        .eq("tg_user_id", userSession.tgUserId);
      if (error) return json({ error: "COLLECTION_CLEAR_FAILED", details: error.message }, 500);
      return json({ ok: true, scope, action });
    }

    return json({ error: "BAD_PAYLOAD" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
