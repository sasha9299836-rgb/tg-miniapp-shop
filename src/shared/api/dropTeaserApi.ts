import { supabase } from "./supabaseClient";

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
  updated_at: string;
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
    updatedAt: row.updated_at,
  };
}

export async function getActiveDropTeaser(): Promise<DropTeaser | null> {
  const { data, error } = await supabase
    .from("tg_drop_teasers")
    .select("id, title, short_text, details, preview_images, item_count, drop_date, highlights, is_active, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapDropTeaser(data as DropTeaserRow);
}
