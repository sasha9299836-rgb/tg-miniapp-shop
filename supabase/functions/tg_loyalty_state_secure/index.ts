import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type LoyaltyState = {
  total_spent: number;
  level: number;
  next_level: number | null;
  next_level_threshold: number | null;
  amount_to_next_level: number;
  bonuses: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const { data, error } = await supabase.rpc("tg_get_loyalty_state", {
      p_tg_user_id: userSession.tgUserId,
    });

    if (error) {
      return json({ error: "LOYALTY_STATE_LOAD_FAILED", details: error.message }, 500);
    }

    const loyalty = (Array.isArray(data) ? data[0] : data) as LoyaltyState | null;
    if (!loyalty || typeof loyalty !== "object") {
      return json({ error: "LOYALTY_STATE_LOAD_FAILED" }, 500);
    }

    return json({ ok: true, loyalty });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});

