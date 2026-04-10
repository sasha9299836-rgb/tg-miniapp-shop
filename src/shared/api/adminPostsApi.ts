import { supabase } from "./supabaseClient";
import type { DefectMediaItem, Product } from "../types/product";

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

export type DraftWriteDebugEvent =
  | { type: "branch_start"; branch: DraftWriteBranch; snapshot: DraftWritePayloadSnapshot }
  | { type: "branch_success"; branch: DraftWriteBranch; snapshot: DraftWritePayloadSnapshot; savedId: string }
  | {
    type: "branch_error";
    branch: DraftWriteBranch;
    snapshot: DraftWritePayloadSnapshot;
    error: {
      name: string | null;
      message: string | null;
      code: string | null;
      details: string | null;
      hint: string | null;
      status: number | null;
    };
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

function debugErrorSnapshot(error: unknown) {
  if (error instanceof Error) {
    const anyError = error as Error & { code?: string; details?: string; hint?: string; status?: number };
    return {
      name: anyError.name,
      message: anyError.message,
      stack: anyError.stack ?? null,
      code: anyError.code ?? null,
      details: anyError.details ?? null,
      hint: anyError.hint ?? null,
      status: anyError.status ?? null,
    };
  }
  return { value: String(error) };
}

function throwDraftStepError(step: string, error: unknown): never {
  const snapshot = debugErrorSnapshot(error);
  debugDraftStep(`${step} error`, snapshot);
  throw new Error(
    `[createOrUpdateDraftPost:${step}] ${snapshot.message ?? "UNKNOWN_ERROR"}`,
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
  const scheduledAt = payload.scheduled_at;
  const nextStatus: TgPostStatus = payload.current_status === "published"
    ? "published"
    : scheduledAt
    ? "scheduled"
    : "draft";
  const nextPublishedAt = nextStatus === "published" ? (payload.current_published_at ?? new Date().toISOString()) : null;
  const writePayload = {
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
    status: nextStatus,
    scheduled_at: scheduledAt,
    published_at: nextPublishedAt,
  };
  const snapshot = toDraftSnapshot(writePayload, postId);
  const reportStart = (branch: DraftWriteBranch) => {
    onDebugEvent?.({ type: "branch_start", branch, snapshot });
  };
  const reportSuccess = (branch: DraftWriteBranch, savedId: string) => {
    onDebugEvent?.({ type: "branch_success", branch, snapshot, savedId });
  };
  const reportError = (branch: DraftWriteBranch, error: unknown) => {
    const raw = debugErrorSnapshot(error);
    const normalized = {
      name: (raw as { name?: string | null }).name ?? null,
      message: (raw as { message?: string | null }).message ?? null,
      code: (raw as { code?: string | null }).code ?? null,
      details: (raw as { details?: string | null }).details ?? null,
      hint: (raw as { hint?: string | null }).hint ?? null,
      status: (raw as { status?: number | null }).status ?? null,
    };
    onDebugEvent?.({
      type: "branch_error",
      branch,
      snapshot,
      error: normalized,
    });
  };
  debugDraftStep("start", {
    postId: postId ?? null,
    branch: postId ? "update_by_id" : payload.item_id != null ? "select_by_item_id_then_write" : "insert",
    payload: writePayload,
  });

  if (postId) {
    try {
      reportStart("update_by_id");
      debugDraftStep("update_by_id start", { postId, payload: writePayload });
      const { data, error } = await supabase
        .from("tg_posts")
        .update(writePayload)
        .eq("id", postId)
        .select("*")
        .single();
      if (error) throw error;
      debugDraftStep("update_by_id success", { postId, savedId: data.id });
      reportSuccess("update_by_id", data.id);
      return data as TgPost;
    } catch (error) {
      reportError("update_by_id", error);
      throwDraftStepError("update_by_id", error);
    }
  }

  // For warehouse flow resolve existing by item_id first.
  if (payload.item_id != null) {
    try {
      reportStart("select_by_item_id");
      debugDraftStep("select_by_item_id start", { item_id: payload.item_id });
      const { data: existing, error: existingError } = await supabase
        .from("tg_posts")
        .select("id")
        .eq("item_id", payload.item_id)
        .maybeSingle();
      if (existingError) throw existingError;
      debugDraftStep("select_by_item_id success", { item_id: payload.item_id, existingId: existing?.id ?? null });
      reportSuccess("select_by_item_id", existing?.id ?? "none");

      if (existing?.id) {
        reportStart("update_existing_by_item_id");
        debugDraftStep("update_existing_by_item_id start", { existingId: existing.id, payload: writePayload });
        const { data, error } = await supabase
          .from("tg_posts")
          .update(writePayload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        debugDraftStep("update_existing_by_item_id success", { savedId: data.id });
        reportSuccess("update_existing_by_item_id", data.id);
        return data as TgPost;
      }
    } catch (error) {
      reportError("select_by_item_id", error);
      // Fallback for mobile/webview transport glitches on initial SELECT path.
      debugDraftStep("select_by_item_id_or_update failed, trying upsert_fallback", {
        item_id: payload.item_id,
        error: debugErrorSnapshot(error),
      });
      try {
        reportStart("upsert_fallback");
        const { data, error: upsertError } = await supabase
          .from("tg_posts")
          .upsert(writePayload, { onConflict: "item_id" })
          .select("*")
          .single();
        if (upsertError) throw upsertError;
        debugDraftStep("upsert_fallback success", { savedId: data.id });
        reportSuccess("upsert_fallback", data.id);
        return data as TgPost;
      } catch (fallbackError) {
        reportError("upsert_fallback", fallbackError);
        throwDraftStepError("upsert_fallback_after_select_failure", fallbackError);
      }
    }
  }

  try {
    reportStart("insert_new");
    debugDraftStep("insert_new start", { payload: writePayload });
    const { data, error } = await supabase
      .from("tg_posts")
      .insert(writePayload)
      .select("*")
      .single();
    if (error) throw error;
    debugDraftStep("insert_new success", { savedId: data.id });
    reportSuccess("insert_new", data.id);
    return data as TgPost;
  } catch (error) {
    reportError("insert_new", error);
    throwDraftStepError("insert_new", error);
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

export async function createPostPhoto(payload: {
  post_id: string;
  item_id: number | null;
  photo_no: number;
  url: string;
  storage_key: string;
  kind?: "main" | "defect";
  sort_order: number;
}) {
  const { data, error } = await supabase
    .from("tg_post_photos")
    .insert({
      post_id: payload.post_id,
      item_id: payload.item_id,
      photo_no: payload.photo_no,
      url: payload.url,
      storage_key: payload.storage_key,
      kind: payload.kind ?? "main",
      sort_order: payload.sort_order,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TgPostPhoto;
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

export async function deletePostPhoto(photoId: string) {
  const { error } = await supabase.from("tg_post_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function deletePostDefectPhoto(photoId: number) {
  const { error } = await supabase.from("tg_post_defect_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function publishPostNow(postId: string): Promise<TgPost> {
  const { data, error } = await supabase
    .from("tg_posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      scheduled_at: null,
      sale_status: "available",
    })
    .eq("id", postId)
    .select("*")
    .single();
  if (error) throw error;
  return data as TgPost;
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
    saleStatus: post.sale_status,
  }));
}
