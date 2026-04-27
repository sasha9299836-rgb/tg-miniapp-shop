import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";

type DraftWriteBranch =
  | "update_by_id"
  | "select_by_item_id"
  | "update_existing_by_item_id"
  | "upsert_fallback"
  | "insert_new";

type DraftWritePayload = {
  item_id: number | null;
  nalichie_id: number | null;
  is_in_update: boolean;
  post_type: "warehouse" | "consignment";
  origin_profile: "ODN" | "YAN";
  packaging_preset: "A2" | "A3" | "A4";
  title: string;
  brand: string | null;
  size: string | null;
  price: number;
  description: string;
  condition: string;
  has_defects: boolean;
  defects_text: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  scheduled_at: string | null;
  published_at: string | null;
};

function normalizeOptionalString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }
  return fallback;
}

function normalizePayload(raw: unknown): DraftWritePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const postType = row.post_type === "consignment" ? "consignment" : row.post_type === "warehouse" ? "warehouse" : null;
  const origin = row.origin_profile === "YAN" ? "YAN" : row.origin_profile === "ODN" ? "ODN" : null;
  const packaging = row.packaging_preset === "A2" || row.packaging_preset === "A3" || row.packaging_preset === "A4"
    ? row.packaging_preset
    : null;
  const status = row.status === "draft" || row.status === "scheduled" || row.status === "published" || row.status === "archived"
    ? row.status
    : null;
  const title = String(row.title ?? "").trim();
  const description = String(row.description ?? "").trim();
  const condition = String(row.condition ?? "").trim();
  const price = Number(row.price);
  const itemId = row.item_id == null ? null : Number(row.item_id);
  const nalichieId = row.nalichie_id == null ? null : Number(row.nalichie_id);
  const isInUpdate = normalizeBoolean(row.is_in_update, false);
  const hasDefects = Boolean(row.has_defects);
  const defectsText = hasDefects ? normalizeOptionalString(row.defects_text) : null;

  if (!postType || !origin || !packaging || !status) return null;
  if (!title || !description || !condition || !Number.isFinite(price) || price <= 0) return null;
  if (itemId != null && (!Number.isInteger(itemId) || itemId <= 0)) return null;
  if (nalichieId != null && (!Number.isInteger(nalichieId) || nalichieId <= 0)) return null;

  return {
    item_id: itemId,
    nalichie_id: nalichieId,
    is_in_update: isInUpdate,
    post_type: postType,
    origin_profile: origin,
    packaging_preset: packaging,
    title,
    brand: normalizeOptionalString(row.brand),
    size: normalizeOptionalString(row.size),
    price: Math.round(price),
    description,
    condition,
    has_defects: hasDefects,
    defects_text: defectsText,
    status,
    scheduled_at: normalizeOptionalString(row.scheduled_at),
    published_at: normalizeOptionalString(row.published_at),
  };
}

function toDbErrorPayload(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      message: String(error ?? "UNKNOWN_ERROR"),
      code: null,
      details: null,
      hint: null,
      status: null,
    };
  }
  const row = error as Record<string, unknown>;
  return {
    message: String(row.message ?? "UNKNOWN_ERROR"),
    code: row.code == null ? null : String(row.code),
    details: row.details == null ? null : String(row.details),
    hint: row.hint == null ? null : String(row.hint),
    status: typeof row.status === "number" ? row.status : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as { post_id?: unknown; payload?: unknown } | null;
    const postId = typeof body?.post_id === "string" ? body.post_id.trim() : "";
    const writePayload = normalizePayload(body?.payload);
    if (!writePayload) return json({ error: "BAD_PAYLOAD" }, 400);

    let branch: DraftWriteBranch = "insert_new";

    if (postId) {
      branch = "update_by_id";
      const { data, error } = await supabase
        .from("tg_posts")
        .update(writePayload)
        .eq("id", postId)
        .select("*")
        .single();
      if (error) return json({ error: "DRAFT_WRITE_FAILED", branch, db: toDbErrorPayload(error) }, 500);
      return json({ ok: true, branch, post: data }, 200);
    }

    if (writePayload.item_id != null) {
      branch = "select_by_item_id";
      const { data: existing, error: existingError } = await supabase
        .from("tg_posts")
        .select("id")
        .eq("item_id", writePayload.item_id)
        .maybeSingle();
      if (existingError) return json({ error: "DRAFT_WRITE_FAILED", branch, db: toDbErrorPayload(existingError) }, 500);

      if (existing?.id) {
        branch = "update_existing_by_item_id";
        const { data, error } = await supabase
          .from("tg_posts")
          .update(writePayload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) return json({ error: "DRAFT_WRITE_FAILED", branch, db: toDbErrorPayload(error) }, 500);
        return json({ ok: true, branch, post: data }, 200);
      }
    }

    branch = "insert_new";
    const { data, error } = await supabase
      .from("tg_posts")
      .insert(writePayload)
      .select("*")
      .single();
    if (error) return json({ error: "DRAFT_WRITE_FAILED", branch, db: toDbErrorPayload(error) }, 500);
    return json({ ok: true, branch, post: data }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
