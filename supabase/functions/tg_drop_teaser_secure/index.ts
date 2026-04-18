import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type DropTeaserPayload = {
  id: string;
  title: string;
  short_text: string;
  details: string | null;
  preview_images: string[];
  item_count: number | null;
  drop_date: string | null;
  highlights: string[];
  is_active: boolean;
  updated_at: string;
  published_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const { data, error } = await supabase.rpc("tg_get_active_drop_teaser_for_user", {
      p_tg_user_id: userSession.tgUserId,
    });

    if (error) {
      return json({ error: "DROP_TEASER_LOAD_FAILED", details: error.message }, 500);
    }

    const teaser = (Array.isArray(data) ? data[0] : data) as DropTeaserPayload | null;
    if (!teaser) return json({ ok: true, teaser: null });

    return json({ ok: true, teaser });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});

