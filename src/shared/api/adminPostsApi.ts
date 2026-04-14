import { supabase } from "./supabaseClient";
import type { DefectMediaItem, Product } from "../types/product";
import { ensureAdminRuntimeReady } from "../auth/adminRuntimeReadiness";
import { getCdekProxyBaseUrl } from "./cdekProxyBase";

export type NalichieItem = {
  id: number;
  status?: string | null;
  opisanie_veshi: string | null;
  tip_veshi: string | null;
  brend: string | null;
  razmer: string | null;
  obh_summa: number | null;
  sezon?: string | null;
  defekt_marker?: boolean | null;
  defekt_text?: string | null;
  data_pokupki?: string | null;
  data_postupleniya?: string | null;
  vikup_rub?: number | null;
  valuta_vikupa?: string | null;
  kol_vo_valuti?: number | null;
  kurs?: number | null;
  dostavka?: number | null;
};

export type TgPostStatus = "draft" | "scheduled" | "published" | "archived";
export type TgPostType = "warehouse" | "consignment";
export type TgPostOriginProfile = "ODN" | "YAN";
export type TgPostPackagingPreset = "A2" | "A3" | "A4";

export type TgPost = {
  id: string;
  item_id: number | null;
  nalichie_id: number | null;
  post_type: TgPostType;
  origin_profile: TgPostOriginProfile | null;
  packaging_preset: TgPostPackagingPreset | null;
  title: string;
  brand: string | null;
  size: string | null;
  price: number;
  description: string;
  condition: string;
  has_defects: boolean;
  defects_text: string | null;
  video_url: string | null;
  measurements_text: string | null;
  status: TgPostStatus;
  sale_status: "available" | "reserved" | "sold";
  reserved_until: string | null;
  reserved_order_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TgPostPhoto = {
  id: string;
  post_id: string;
  item_id: number | null;
  photo_no: number;
  url: string;
  storage_key: string;
  kind: "main" | "defect";
  sort_order: number;
};

export type TgPostDefectPhoto = {
  id: number;
  post_id: string;
  photo_no: number;
  storage_key: string;
  public_url: string;
  media_type: "image" | "video";
  created_at: string;
};

export type TgPostMeasurementPhoto = {
  id: number;
  post_id: string;
  photo_no: number;
  storage_key: string;
  public_url: string;
  created_at: string;
};

export type CreateDraftPostPayload = {
  item_id: number | null;
  nalichie_id: number | null;
  post_type: TgPostType;
  origin_profile: TgPostOriginProfile;
  packaging_preset: TgPostPackagingPreset;
  title: string;
  brand: string | null;
  size: string | null;
  price: number;
  description: string;
  condition: string;
  has_defects: boolean;
  defects_text: string | null;
  measurements_text: string | null;
  scheduled_at: string | null;
  current_status?: TgPostStatus;
  current_published_at?: string | null;
};

export type DraftWriteBranch =
  | "update_by_id"
  | "select_by_item_id"
  | "update_existing_by_item_id"
  | "upsert_fallback"
  | "insert_new";

export type DraftWritePayloadSnapshot = {
  postId: string | null;
  item_id: number | null;
  nalichie_id: number | null;
  post_type: TgPostType;
  status: TgPostStatus;
  has_defects: boolean;
  defects_text_length: number;
};

export type DraftWritePayload = {
  item_id: number | null;
  nalichie_id: number | null;
  post_type: TgPostType;
  origin_profile: TgPostOriginProfile;
  packaging_preset: TgPostPackagingPreset;
  title: string;
  brand: string | null;
  size: string | null;
  price: number;
  description: string;
  condition: string;
  has_defects: boolean;
  defects_text: string | null;
  measurements_text: string | null;
  status: TgPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
};

export type DraftWriteErrorSnapshot = {
  type_of: string;
  is_error_instance: boolean;
  name: string | null;
  message: string | null;
  code: string | null;
  details: string | null;
  hint: string | null;
  status: number | null;
  statusText: string | null;
  cause: string | null;
  stack: string | null;
  raw_keys: string[] | null;
  raw_json: string | null;
  raw_value: string | null;
};

type DraftWriteServerResponse = {
  ok?: boolean;
  branch?: string;
  post?: TgPost;
  error?: string;
  details?: unknown;
  db?: {
    message?: string | null;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
    status?: number | null;
  } | null;
};

type CreatePostPhotoProxyResponse = {
  ok?: boolean;
  photo_no?: number;
  key?: string;
  photo?: TgPostPhoto | null;
  error?: string;
  details?: unknown;
};

type CreateMeasurementPhotoProxyResponse = {
  ok?: boolean;
  photo_no?: number;
  storage_key?: string;
  public_url?: string;
  photo?: TgPostMeasurementPhoto | null;
  error?: string;
  details?: unknown;
};

type PublishPostProxyResponse = {
  ok?: boolean;
  post_id?: string;
  status?: string;
  post?: TgPost | null;
  error?: string;
  details?: unknown;
};

const cdekProxyBaseUrl = getCdekProxyBaseUrl();

export type DraftWriteDebugEvent =
  | { type: "branch_start"; branch: DraftWriteBranch; snapshot: DraftWritePayloadSnapshot; at: string; started_at_ms: number }
  | {
    type: "branch_success";
    branch: DraftWriteBranch;
    snapshot: DraftWritePayloadSnapshot;
    savedId: string;
    at: string;
    finished_at_ms: number;
    duration_ms: number | null;
  }
  | {
    type: "branch_error";
    branch: DraftWriteBranch;
    snapshot: DraftWritePayloadSnapshot;
    error: DraftWriteErrorSnapshot;
    at: string;
    failed_at_ms: number;
    duration_ms: number | null;
  }
  | {
    type: "insert_payload";
    branch: "insert_new";
    snapshot: DraftWritePayloadSnapshot;
    payload: DraftWritePayload;
    at: string;
    started_at_ms: number;
  }
  | {
    type: "ghost_insert_probe";
    branch: "insert_new";
    snapshot: DraftWritePayloadSnapshot;
    at: string;
    probe_since: string;
    rows: Array<{ id: string; created_at: string; status: string; post_type: string; item_id: number | null }>;
    probe_error: string | null;
  }
  | {
    type: "invoke_context";
    branch: DraftWriteBranch;
    snapshot: DraftWritePayloadSnapshot;
    at: string;
    function_name: "tg_admin_draft_post_write";
    token_present: boolean;
    token_length: number;
    token_preview: string | null;
  };

export type ScheduledPostListItem = {
  post: TgPost;
  photoCount: number;
  previewUrls: string[];
};

function debugDraftStep(step: string, payload?: unknown) {
  if (payload === undefined) {
    console.debug(`[createOrUpdateDraftPost] ${step}`);
    return;
  }
  console.debug(`[createOrUpdateDraftPost] ${step}`, payload);
}

function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toDebugText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  const json = safeJsonStringify(value);
  if (json) return json;
  try {
    return String(value);
  } catch {
    return null;
  }
}

function readAdminToken(): string {
  try {
    return (window.localStorage.getItem("tg_admin_session_token") ?? "").trim();
  } catch {
    return "";
  }
}

function maskTokenPreview(token: string): string | null {
  const normalized = token.trim();
  if (!normalized) return null;
  if (normalized.length <= 10) return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function debugErrorSnapshot(error: unknown): DraftWriteErrorSnapshot {
  const asAny = (error as Record<string, unknown>) ?? {};
  const isObjectLike = typeof error === "object" && error !== null;
  const rawKeys = isObjectLike ? Object.keys(asAny) : null;
  const rawJson = safeJsonStringify(error);
  const maybeName = isObjectLike && "name" in asAny ? toDebugText(asAny.name) : null;
  const maybeMessage = isObjectLike && "message" in asAny ? toDebugText(asAny.message) : null;
  const maybeCode = isObjectLike && "code" in asAny ? toDebugText(asAny.code) : null;
  const maybeDetails = isObjectLike && "details" in asAny ? toDebugText(asAny.details) : null;
  const maybeHint = isObjectLike && "hint" in asAny ? toDebugText(asAny.hint) : null;
  const maybeStatus = isObjectLike && "status" in asAny && typeof asAny.status === "number"
    ? asAny.status
    : null;
  const maybeStatusText = isObjectLike && "statusText" in asAny ? toDebugText(asAny.statusText) : null;
  const maybeCause = isObjectLike && "cause" in asAny ? toDebugText(asAny.cause) : null;
  const maybeStack = isObjectLike && "stack" in asAny ? toDebugText(asAny.stack) : null;
  const message = maybeMessage ?? (error instanceof Error ? error.message : null);
  const name = maybeName ?? (error instanceof Error ? error.name : null);
  const stack = maybeStack ?? (error instanceof Error ? error.stack ?? null : null);

  return {
    type_of: typeof error,
    is_error_instance: error instanceof Error,
    name,
    message,
    code: maybeCode,
    details: maybeDetails,
    hint: maybeHint,
    status: maybeStatus,
    statusText: maybeStatusText,
    cause: maybeCause,
    stack,
    raw_keys: rawKeys,
    raw_json: rawJson,
    raw_value: toDebugText(error),
  };
}

function normalizeServerBranch(value: string | null | undefined, fallback: DraftWriteBranch): DraftWriteBranch {
  if (
    value === "update_by_id"
    || value === "select_by_item_id"
    || value === "update_existing_by_item_id"
    || value === "upsert_fallback"
    || value === "insert_new"
  ) {
    return value;
  }
  return fallback;
}

async function invokeDraftWriteWithFetch(input: {
  post_id: string | null;
  payload: DraftWritePayload;
  adminToken: string;
}): Promise<DraftWriteServerResponse> {
  if (!cdekProxyBaseUrl) {
    throw new Error("[tg_admin_draft_post_write] CDEK proxy URL is missing");
  }

  const url = `${cdekProxyBaseUrl}/api/admin/draft-post/write`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${input.adminToken}`,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      post_id: input.post_id,
      payload: input.payload,
    }),
  });

  const rawText = await response.text();
  let parsed: DraftWriteServerResponse | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as DraftWriteServerResponse;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const detailsRecord = asRecord(parsed?.details);
    const dbFromDetails = asRecord(detailsRecord?.db);
    const details =
      parsed?.details ??
      parsed?.db?.details ??
      dbFromDetails?.details ??
      rawText;
    const message =
      parsed?.error ??
      parsed?.db?.message ??
      (typeof dbFromDetails?.message === "string" ? dbFromDetails.message : null) ??
      `HTTP_${response.status}`;
    const detailsText = typeof details === "string" ? details : (safeJsonStringify(details) ?? String(details ?? ""));
    throw new Error(`[tg_admin_draft_post_write] ${message}${detailsText ? ` | ${detailsText}` : ""}`);
  }

  if (!parsed) {
    throw new Error("[tg_admin_draft_post_write] EMPTY_OR_INVALID_RESPONSE");
  }
  return parsed;
}

function throwDraftStepError(step: string, error: unknown): never {
  const snapshot = debugErrorSnapshot(error);
  debugDraftStep(`${step} error`, snapshot);
  const bestMessage =
    snapshot.message ??
    snapshot.details ??
    snapshot.code ??
    snapshot.raw_json ??
    snapshot.raw_value ??
    "UNKNOWN_ERROR";
  throw new Error(
    `[createOrUpdateDraftPost:${step}] ${bestMessage}`,
    { cause: error instanceof Error ? error : undefined },
  );
}

function toDraftSnapshot(writePayload: {
  item_id: number | null;
  nalichie_id: number | null;
  post_type: TgPostType;
  status: TgPostStatus;
  has_defects: boolean;
  defects_text: string | null;
}, postId?: string): DraftWritePayloadSnapshot {
  return {
    postId: postId ?? null,
    item_id: writePayload.item_id,
    nalichie_id: writePayload.nalichie_id,
    post_type: writePayload.post_type,
    status: writePayload.status,
    has_defects: writePayload.has_defects,
    defects_text_length: (writePayload.defects_text ?? "").trim().length,
  };
}

function syntheticIdFromUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i += 1) {
    hash = (hash * 31 + uuid.charCodeAt(i)) >>> 0;
  }
  return -(hash % 2_000_000_000) - 1;
}

export async function fetchNalichieById(itemId: number): Promise<NalichieItem | null> {
  const { data, error } = await supabase
    .from("nalichie")
    .select("id, status, opisanie_veshi, tip_veshi, brend, razmer, obh_summa, sezon, defekt_marker, defekt_text, data_pokupki, data_postupleniya, vikup_rub, valuta_vikupa, kol_vo_valuti, kurs, dostavka")
    .eq("id", itemId)
    .in("status", ["in_stock", "in_transit"])
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: Number(data.id),
    status: data.status == null ? null : String(data.status),
    opisanie_veshi: data.opisanie_veshi ?? null,
    tip_veshi: data.tip_veshi ?? null,
    brend: data.brend ?? null,
    razmer: data.razmer ?? null,
    obh_summa: data.obh_summa == null ? null : Number(data.obh_summa),
    sezon: data.sezon ?? null,
    defekt_marker: data.defekt_marker ?? null,
    defekt_text: data.defekt_text ?? null,
    data_pokupki: data.data_pokupki ?? null,
    data_postupleniya: data.data_postupleniya ?? null,
    vikup_rub: data.vikup_rub == null ? null : Number(data.vikup_rub),
    valuta_vikupa: data.valuta_vikupa ?? null,
    kol_vo_valuti: data.kol_vo_valuti == null ? null : Number(data.kol_vo_valuti),
    kurs: data.kurs == null ? null : Number(data.kurs),
    dostavka: data.dostavka == null ? null : Number(data.dostavka),
  };
}

export async function fetchNalichieByIdViaRpc(nalichieId: number): Promise<NalichieItem | null> {
  const { data, error } = await supabase.rpc("tg_admin_get_nalichie", {
    p_nalichie_id: nalichieId,
  });

  if (error) throw error;
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    id: Number(row.id),
    status: row.status == null ? null : String(row.status),
    opisanie_veshi: row.opisanie_veshi ?? null,
    tip_veshi: row.tip_veshi ?? null,
    brend: row.brend ?? null,
    razmer: row.razmer ?? null,
    obh_summa: row.obh_summa == null ? null : Number(row.obh_summa),
    sezon: row.sezon ?? null,
    defekt_marker: row.defekt_marker ?? null,
    defekt_text: row.defekt_text ?? null,
    data_pokupki: row.data_pokupki ?? null,
    data_postupleniya: row.data_postupleniya ?? null,
    vikup_rub: row.vikup_rub == null ? null : Number(row.vikup_rub),
    valuta_vikupa: row.valuta_vikupa ?? null,
    kol_vo_valuti: row.kol_vo_valuti == null ? null : Number(row.kol_vo_valuti),
    kurs: row.kurs == null ? null : Number(row.kurs),
    dostavka: row.dostavka == null ? null : Number(row.dostavka),
  };
}

export async function createOrUpdateDraftPost(
  payload: CreateDraftPostPayload,
  postId?: string,
  onDebugEvent?: (event: DraftWriteDebugEvent) => void,
): Promise<TgPost> {
  await ensureAdminRuntimeReady();
  const scheduledAt = payload.scheduled_at;
  const nextStatus: TgPostStatus = payload.current_status === "published"
    ? "published"
    : scheduledAt
    ? "scheduled"
    : "draft";
  const nextPublishedAt = nextStatus === "published" ? (payload.current_published_at ?? new Date().toISOString()) : null;
  const writePayload: DraftWritePayload = {
    item_id: payload.item_id,
    nalichie_id: payload.nalichie_id,
    post_type: payload.post_type,
    origin_profile: payload.origin_profile,
    packaging_preset: payload.packaging_preset,
    title: payload.title,
    brand: payload.brand,
    size: payload.size,
    price: payload.price,
    description: payload.description,
    condition: payload.condition,
    has_defects: payload.has_defects,
    defects_text: payload.has_defects ? payload.defects_text : null,
    measurements_text: payload.measurements_text,
    status: nextStatus,
    scheduled_at: scheduledAt,
    published_at: nextPublishedAt,
  };
  const snapshot = toDraftSnapshot(writePayload, postId);
  const branchStartAtMs: Partial<Record<DraftWriteBranch, number>> = {};
  const reportStart = (branch: DraftWriteBranch) => {
    const now = Date.now();
    branchStartAtMs[branch] = now;
    onDebugEvent?.({
      type: "branch_start",
      branch,
      snapshot,
      at: new Date(now).toISOString(),
      started_at_ms: now,
    });
  };
  const reportSuccess = (branch: DraftWriteBranch, savedId: string) => {
    const finishedAt = Date.now();
    const startedAt = branchStartAtMs[branch];
    onDebugEvent?.({
      type: "branch_success",
      branch,
      snapshot,
      savedId,
      at: new Date(finishedAt).toISOString(),
      finished_at_ms: finishedAt,
      duration_ms: typeof startedAt === "number" ? finishedAt - startedAt : null,
    });
  };
  const reportError = (branch: DraftWriteBranch, error: unknown) => {
    const raw = debugErrorSnapshot(error);
    const failedAt = Date.now();
    const startedAt = branchStartAtMs[branch];
    onDebugEvent?.({
      type: "branch_error",
      branch,
      snapshot,
      error: raw,
      at: new Date(failedAt).toISOString(),
      failed_at_ms: failedAt,
      duration_ms: typeof startedAt === "number" ? failedAt - startedAt : null,
    });
  };
  debugDraftStep("start", {
    postId: postId ?? null,
    branch: postId ? "update_by_id" : payload.item_id != null ? "select_by_item_id_then_write" : "insert_new",
    payload: writePayload,
  });
  const predictedBranch: DraftWriteBranch = postId
    ? "update_by_id"
    : payload.item_id != null
    ? "select_by_item_id"
    : "insert_new";
  try {
    reportStart(predictedBranch);
    if (predictedBranch === "insert_new") {
      onDebugEvent?.({
        type: "insert_payload",
        branch: "insert_new",
        snapshot,
        payload: writePayload,
        at: new Date().toISOString(),
        started_at_ms: Date.now(),
      });
    }
    debugDraftStep("server_wrapper start", {
      function: "tg_admin_draft_post_write",
      predictedBranch,
      postId: postId ?? null,
      payload: writePayload,
    });
    const adminToken = readAdminToken();
    onDebugEvent?.({
      type: "invoke_context",
      branch: predictedBranch,
      snapshot,
      at: new Date().toISOString(),
      function_name: "tg_admin_draft_post_write",
      token_present: Boolean(adminToken),
      token_length: adminToken.length,
      token_preview: maskTokenPreview(adminToken),
    });
    const data = await invokeDraftWriteWithFetch({
      post_id: postId ?? null,
      payload: writePayload,
      adminToken,
    });
    if (!data?.ok || !data?.post) {
      throw new Error(
        `[tg_admin_draft_post_write] ${data?.error ?? "UNKNOWN_ERROR"} ${data?.details ?? data?.db?.message ?? ""}`.trim(),
      );
    }
    const actualBranch = normalizeServerBranch(data.branch, predictedBranch);
    debugDraftStep("server_wrapper success", {
      function: "tg_admin_draft_post_write",
      actualBranch,
      savedId: data.post.id,
    });
    reportSuccess(actualBranch, data.post.id);
    return data.post;
  } catch (error) {
    reportError(predictedBranch, error);
    throwDraftStepError(predictedBranch, error);
  }
}

export async function getPostByItemId(itemId: number): Promise<TgPost | null> {
  const { data, error } = await supabase.from("tg_posts").select("*").eq("item_id", itemId).maybeSingle();
  if (error) throw error;
  return (data as TgPost | null) ?? null;
}

export async function getPostByNalichieId(nalichieId: number): Promise<TgPost | null> {
  const { data, error } = await supabase.from("tg_posts").select("*").eq("nalichie_id", nalichieId).maybeSingle();
  if (error) throw error;
  return (data as TgPost | null) ?? null;
}

export async function getPostById(postId: string): Promise<TgPost | null> {
  const { data, error } = await supabase.from("tg_posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw error;
  return (data as TgPost | null) ?? null;
}

export async function getPostPhotos(postId: string): Promise<TgPostPhoto[]> {
  const { data, error } = await supabase
    .from("tg_post_photos")
    .select("*")
    .eq("post_id", postId)
    .order("photo_no", { ascending: true });
  if (error) throw error;
  return (data as TgPostPhoto[]) ?? [];
}

export async function getPostDefectPhotos(postId: string): Promise<TgPostDefectPhoto[]> {
  const { data, error } = await supabase
    .from("tg_post_defect_photos")
    .select("*")
    .eq("post_id", postId)
    .order("photo_no", { ascending: true });
  if (error) throw error;
  return (data as TgPostDefectPhoto[]) ?? [];
}

export async function getPostMeasurementPhotos(postId: string): Promise<TgPostMeasurementPhoto[]> {
  const { data, error } = await supabase
    .from("tg_post_measurement_photos")
    .select("*")
    .eq("post_id", postId)
    .order("photo_no", { ascending: true });
  if (error) throw error;
  return (data as TgPostMeasurementPhoto[]) ?? [];
}

export async function createPostPhoto(payload: {
  post_id: string;
  item_id: number | null;
  photo_no: number;
  url: string;
  storage_key: string;
  kind?: "main" | "defect";
  sort_order: number;
}) {
  const adminToken = readAdminToken();
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }
  const url = `${cdekProxyBaseUrl}/api/admin/post-photo/create`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      post_id: payload.post_id,
      photo_no: payload.photo_no,
      key: payload.storage_key,
    }),
  });

  const rawText = await response.text().catch(() => "");
  let parsed: CreatePostPhotoProxyResponse | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as CreatePostPhotoProxyResponse) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const details = parsed?.details ? (safeJsonStringify(parsed.details) ?? String(parsed.details)) : rawText;
    const message = parsed?.error ?? `HTTP_${response.status}`;
    throw new Error(`[post-photo-create] ${message}${details ? ` | ${details}` : ""}`);
  }

  if (!parsed?.ok || !parsed.photo) {
    throw new Error("[post-photo-create] EMPTY_OR_INVALID_RESPONSE");
  }
  return parsed.photo as TgPostPhoto;
}

export async function createPostDefectPhoto(payload: {
  post_id: string;
  photo_no: number;
  storage_key: string;
  public_url: string;
  media_type?: "image" | "video";
}) {
  const { data, error } = await supabase
    .from("tg_post_defect_photos")
    .insert({
      ...payload,
      media_type: payload.media_type ?? "image",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TgPostDefectPhoto;
}

export async function createPostMeasurementPhoto(payload: {
  post_id: string;
  photo_no: number;
  storage_key: string;
}) {
  const adminToken = readAdminToken();
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }
  const url = `${cdekProxyBaseUrl}/api/admin/measurement-photo/create`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      post_id: payload.post_id,
      photo_no: payload.photo_no,
      storage_key: payload.storage_key,
    }),
  });

  const rawText = await response.text().catch(() => "");
  let parsed: CreateMeasurementPhotoProxyResponse | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as CreateMeasurementPhotoProxyResponse) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const details = parsed?.details ? (safeJsonStringify(parsed.details) ?? String(parsed.details)) : rawText;
    const message = parsed?.error ?? `HTTP_${response.status}`;
    throw new Error(`[measurement-photo-create] ${message}${details ? ` | ${details}` : ""}`);
  }

  if (!parsed?.ok || !parsed.photo) {
    throw new Error("[measurement-photo-create] EMPTY_OR_INVALID_RESPONSE");
  }
  return parsed.photo as TgPostMeasurementPhoto;
}

export async function deletePostPhoto(photoId: string) {
  const { error } = await supabase.from("tg_post_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function deletePostDefectPhoto(photoId: number) {
  const { error } = await supabase.from("tg_post_defect_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function deleteDefectPhotoViaProxy(payload: { id?: number | null; storage_key?: string | null }) {
  const adminToken = readAdminToken();
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }
  if (!cdekProxyBaseUrl) {
    throw new Error("CDEK_PROXY_URL_MISSING");
  }
  const url = `${cdekProxyBaseUrl}/api/admin/defect-photo/delete`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      id: payload.id ?? null,
      storage_key: payload.storage_key ?? null,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DEFECT_DELETE_FAILED ${response.status} ${text}`.trim());
  }

  const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  if (!data?.ok) {
    throw new Error("DEFECT_DELETE_INVALID_RESPONSE");
  }
  return data;
}

export async function deletePostMeasurementPhoto(photoId: number) {
  const { error } = await supabase.from("tg_post_measurement_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function publishPostNow(postId: string): Promise<TgPost> {
  const adminToken = readAdminToken();
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }
  const url = `${cdekProxyBaseUrl}/api/admin/post/publish`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ post_id: postId }),
  });

  const rawText = await response.text().catch(() => "");
  let parsed: PublishPostProxyResponse | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as PublishPostProxyResponse) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const details = parsed?.details ? (safeJsonStringify(parsed.details) ?? String(parsed.details)) : rawText;
    const message = parsed?.error ?? `HTTP_${response.status}`;
    throw new Error(`[post-publish] ${message}${details ? ` | ${details}` : ""}`);
  }

  if (!parsed?.ok || parsed.status !== "published" || !parsed.post) {
    throw new Error("[post-publish] EMPTY_OR_INVALID_RESPONSE");
  }
  return parsed.post as TgPost;
}

export async function schedulePost(postId: string, scheduledAtIso: string): Promise<TgPost> {
  const { data, error } = await supabase
    .from("tg_posts")
    .update({
      status: "scheduled",
      scheduled_at: scheduledAtIso,
      published_at: null,
      sale_status: "available",
    })
    .eq("id", postId)
    .select("*")
    .single();
  if (error) throw error;
  return data as TgPost;
}

export async function unschedulePost(postId: string): Promise<TgPost> {
  const { data, error } = await supabase
    .from("tg_posts")
    .update({
      status: "draft",
      scheduled_at: null,
      published_at: null,
      sale_status: "available",
    })
    .eq("id", postId)
    .select("*")
    .single();
  if (error) throw error;
  return data as TgPost;
}

export async function deleteDraftOrScheduledPost(postId: string): Promise<void> {
  const { data: post, error: readError } = await supabase
    .from("tg_posts")
    .select("id, status")
    .eq("id", postId)
    .single();
  if (readError) throw readError;
  const status = (post as { status: TgPostStatus }).status;
  if (status !== "draft" && status !== "scheduled") {
    throw new Error("Удаление доступно только для черновиков и отложенных постов.");
  }

  // TODO: при наличии безопасного server-side удаления добавить очистку объектов в Yandex Storage.
  const { error } = await supabase.from("tg_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function listPostsByStatus(status: "draft" | "scheduled"): Promise<ScheduledPostListItem[]> {
  const { data, error } = await supabase
    .from("tg_posts")
    .select("*")
    .eq("status", status)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const posts = (data as TgPost[]) ?? [];
  if (!posts.length) return [];

  const postIds = posts.map((p) => p.id);
  const { data: photosData, error: photosError } = await supabase
    .from("tg_post_photos")
    .select("post_id, url, photo_no")
    .in("post_id", postIds)
    .order("photo_no", { ascending: true });
  if (photosError) throw photosError;

  const photosByPost = new Map<string, string[]>();
  (photosData ?? []).forEach((row) => {
    const entry = row as { post_id: string; url: string };
    const current = photosByPost.get(entry.post_id) ?? [];
    current.push(entry.url);
    photosByPost.set(entry.post_id, current);
  });

  return posts.map((post) => {
    const urls = photosByPost.get(post.id) ?? [];
    return {
      post,
      photoCount: urls.length,
      previewUrls: urls.slice(0, 3),
    };
  });
}

export async function getPublishedCatalogProducts(): Promise<Product[]> {
  const { data: postsData, error: postsError } = await supabase
    .from("tg_posts")
    .select("*")
    .eq("status", "published")
    .eq("sale_status", "available")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
  if (postsError) throw postsError;

  const posts = (postsData as TgPost[]) ?? [];
  if (!posts.length) return [];

  const postIds = posts.map((p) => p.id);
  const { data: photosData, error: photosError } = await supabase
    .from("tg_post_photos")
    .select("post_id, url, photo_no")
    .in("post_id", postIds)
    .order("photo_no", { ascending: true });
  if (photosError) throw photosError;

  const photosByPost = new Map<string, string[]>();
  (photosData ?? []).forEach((row) => {
    const entry = row as { post_id: string; url: string };
    const current = photosByPost.get(entry.post_id) ?? [];
    current.push(entry.url);
    photosByPost.set(entry.post_id, current);
  });

  const { data: defectData, error: defectError } = await supabase
    .from("tg_post_defect_photos")
    .select("post_id, public_url, photo_no, media_type")
    .in("post_id", postIds)
    .order("photo_no", { ascending: true });
  if (defectError) throw defectError;

  const defectsByPost = new Map<string, DefectMediaItem[]>();
  (defectData ?? []).forEach((row) => {
    const entry = row as { post_id: string; public_url: string; media_type?: string | null };
    const current = defectsByPost.get(entry.post_id) ?? [];
    const mediaType = entry.media_type === "video" ? "video" : "image";
    current.push({ type: mediaType, url: entry.public_url });
    defectsByPost.set(entry.post_id, current);
  });

  const { data: measurementData, error: measurementError } = await supabase
    .from("tg_post_measurement_photos")
    .select("post_id, public_url, photo_no")
    .in("post_id", postIds)
    .order("photo_no", { ascending: true });
  if (measurementError) throw measurementError;

  const measurementsByPost = new Map<string, string[]>();
  (measurementData ?? []).forEach((row) => {
    const entry = row as { post_id: string; public_url: string };
    const current = measurementsByPost.get(entry.post_id) ?? [];
    current.push(entry.public_url);
    measurementsByPost.set(entry.post_id, current);
  });

  return posts.map((post) => ({
    id: post.item_id ?? syntheticIdFromUuid(post.id),
    postId: post.id,
    title: post.title,
    price: post.price,
    images: photosByPost.get(post.id) ?? [],
    isNew: false,
    description: post.description,
    brand: post.brand,
    subtitle: post.description,
    size: post.size,
    condition: post.condition,
    hasDefects: post.has_defects,
    defectsText: post.defects_text,
    defectMedia: defectsByPost.get(post.id) ?? [],
    defectImages: (defectsByPost.get(post.id) ?? []).filter((item) => item.type === "image").map((item) => item.url),
    videoUrl: post.video_url,
    measurementsText: post.measurements_text,
    measurementPhotos: measurementsByPost.get(post.id) ?? [],
    saleStatus: post.sale_status,
  }));
}

export async function getCatalogProductsByPostIds(postIds: string[]): Promise<Product[]> {
  const normalized = [...new Set(postIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!normalized.length) return [];

  const { data: postsData, error: postsError } = await supabase
    .from("tg_posts")
    .select("*")
    .in("id", normalized)
    .eq("status", "published");
  if (postsError) throw postsError;

  const posts = (postsData as TgPost[]) ?? [];
  if (!posts.length) return [];

  const { data: photosData, error: photosError } = await supabase
    .from("tg_post_photos")
    .select("post_id, url, photo_no")
    .in("post_id", normalized)
    .order("photo_no", { ascending: true });
  if (photosError) throw photosError;

  const photosByPost = new Map<string, string[]>();
  (photosData ?? []).forEach((row) => {
    const entry = row as { post_id: string; url: string };
    const current = photosByPost.get(entry.post_id) ?? [];
    current.push(entry.url);
    photosByPost.set(entry.post_id, current);
  });

  const { data: defectData, error: defectError } = await supabase
    .from("tg_post_defect_photos")
    .select("post_id, public_url, photo_no, media_type")
    .in("post_id", normalized)
    .order("photo_no", { ascending: true });
  if (defectError) throw defectError;

  const defectsByPost = new Map<string, DefectMediaItem[]>();
  (defectData ?? []).forEach((row) => {
    const entry = row as { post_id: string; public_url: string; media_type?: string | null };
    const current = defectsByPost.get(entry.post_id) ?? [];
    const mediaType = entry.media_type === "video" ? "video" : "image";
    current.push({ type: mediaType, url: entry.public_url });
    defectsByPost.set(entry.post_id, current);
  });

  const { data: measurementData, error: measurementError } = await supabase
    .from("tg_post_measurement_photos")
    .select("post_id, public_url, photo_no")
    .in("post_id", normalized)
    .order("photo_no", { ascending: true });
  if (measurementError) throw measurementError;

  const measurementsByPost = new Map<string, string[]>();
  (measurementData ?? []).forEach((row) => {
    const entry = row as { post_id: string; public_url: string };
    const current = measurementsByPost.get(entry.post_id) ?? [];
    current.push(entry.public_url);
    measurementsByPost.set(entry.post_id, current);
  });

  return posts.map((post) => ({
    id: post.item_id ?? syntheticIdFromUuid(post.id),
    postId: post.id,
    title: post.title,
    price: post.price,
    images: photosByPost.get(post.id) ?? [],
    isNew: false,
    description: post.description,
    brand: post.brand,
    subtitle: post.description,
    size: post.size,
    condition: post.condition,
    hasDefects: post.has_defects,
    defectsText: post.defects_text,
    defectMedia: defectsByPost.get(post.id) ?? [],
    defectImages: (defectsByPost.get(post.id) ?? []).filter((item) => item.type === "image").map((item) => item.url),
    videoUrl: post.video_url,
    measurementsText: post.measurements_text,
    measurementPhotos: measurementsByPost.get(post.id) ?? [],
    saleStatus: post.sale_status,
  }));
}

export type AdminCatalogVideoItem = {
  id: number;
  postId: string;
  title: string;
  brand: string | null;
  size: string | null;
  previewUrl: string | null;
  currentVideoUrl: string | null;
};

export async function listAdminCatalogVideoItems(): Promise<AdminCatalogVideoItem[]> {
  const products = await getPublishedCatalogProducts();
  return products.map((product) => {
    return {
      id: product.id,
      postId: String(product.postId ?? "").trim(),
      title: product.title,
      brand: product.brand ?? null,
      size: product.size ?? null,
      previewUrl: product.images[0] ?? null,
      currentVideoUrl: product.videoUrl ?? null,
    };
  }).filter((item) => Boolean(item.postId));
}

export async function saveCatalogPostVideoLink(postId: string, videoUrl: string | null): Promise<void> {
  await ensureAdminRuntimeReady();
  const adminToken = readAdminToken();
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }
  const normalizedPostId = String(postId ?? "").trim();
  if (!normalizedPostId) {
    throw new Error("POST_ID_REQUIRED");
  }

  const response = await fetch(`${cdekProxyBaseUrl}/api/admin/post-video/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      post_id: normalizedPostId,
      video_url: String(videoUrl ?? "").trim() || null,
    }),
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`POST_VIDEO_UPDATE_FAILED ${response.status} ${text}`.trim());
  }

  let parsed: { ok?: boolean } | null = null;
  try {
    parsed = text ? (JSON.parse(text) as { ok?: boolean }) : null;
  } catch {
    parsed = null;
  }
  if (!parsed?.ok) {
    throw new Error("POST_VIDEO_UPDATE_INVALID_RESPONSE");
  }
}
