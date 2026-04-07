import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";

type RequestBody = {
  telegram_ids?: Array<string | number>;
};

type TgUserLookupRow = {
  telegram_id: number;
  telegram_username: string | null;
};

function normalizeTelegramIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  for (const item of value) {
    const normalized = Number(item);
    if (Number.isInteger(normalized) && normalized > 0) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as RequestBody | null;
    const telegramIds = normalizeTelegramIds(body?.telegram_ids);
    if (!telegramIds.length) {
      return json({ ok: true, users: [] });
    }

    const { data, error } = await supabase
      .from("tg_users")
      .select("telegram_id, telegram_username")
      .in("telegram_id", telegramIds);

    if (error) {
      return json({ error: "ADMIN_USERS_LOOKUP_FAILED", details: error.message }, 500);
    }

    return json({
      ok: true,
      users: (data ?? []) as TgUserLookupRow[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
