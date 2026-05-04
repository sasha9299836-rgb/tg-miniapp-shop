import { supabase } from "./supabaseClient";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";

export type DropTeaser = {
  id: string;
  title: string;
  shortText: string;
  details: string | null;
  previewImages: string[];
  itemCount: number | null;
  dropDate: string | null;
  highlights: string[];
  isActive: boolean;
  isPublicImmediately: boolean;
  updatedAt: string;
};

type DropTeaserRow = {
  id: string;
  title: string;
  short_text: string;
  details: string | null;
  preview_images: string[] | null;
  item_count: number | null;
  drop_date: string | null;
  highlights: string[] | null;
  is_active: boolean;
  is_public_immediately?: boolean;
  updated_at: string;
  published_at?: string | null;
};

function mapDropTeaser(row: DropTeaserRow): DropTeaser {
  return {
    id: row.id,
    title: row.title,
    shortText: row.short_text,
    details: row.details,
    previewImages: Array.isArray(row.preview_images) ? row.preview_images.filter(Boolean).slice(0, 4) : [],
    itemCount: Number.isFinite(Number(row.item_count)) ? Number(row.item_count) : null,
    dropDate: row.drop_date ?? null,
    highlights: Array.isArray(row.highlights) ? row.highlights.filter(Boolean).slice(0, 6) : [],
    isActive: Boolean(row.is_active),
    isPublicImmediately: Boolean(row.is_public_immediately),
    updatedAt: row.updated_at,
  };
}

export async function getActiveDropTeaser(): Promise<DropTeaser | null> {
  let token = await ensureTelegramUserSessionToken();
  if (!token) {
    token = await ensureTelegramUserSessionToken();
  }
  if (!token) {
    throw new Error("TG_USER_SESSION_REQUIRED");
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    teaser?: DropTeaserRow | null;
  }>("tg_drop_teaser_secure", {
    body: {},
    headers: { "x-tg-user-session": token },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error("DROP_TEASER_LOAD_FAILED");
  if (!data.teaser) return null;
  return mapDropTeaser(data.teaser);
}
