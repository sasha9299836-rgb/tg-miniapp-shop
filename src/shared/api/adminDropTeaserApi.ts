import { ensureAdminRuntimeReady } from "../auth/adminRuntimeReadiness";
import { getCdekProxyBaseUrl } from "./cdekProxyBase";

const cdekProxyBaseUrl = getCdekProxyBaseUrl();

type SaveDropTeaserPayload = {
  title: string;
  short_text: string;
  details: string | null;
  preview_images: string[];
};

function readAdminToken(): string {
  try {
    return (window.localStorage.getItem("tg_admin_session_token") ?? "").trim();
  } catch {
    return "";
  }
}

function ensureAdminToken(): string {
  const token = readAdminToken();
  if (!token) {
    throw new Error("ADMIN_TOKEN_MISSING");
  }
  return token;
}

function ensureValidImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Поддерживаются только изображения.");
  }
}

export async function uploadDropTeaserImage(file: File, slotNo: number): Promise<string> {
  await ensureAdminRuntimeReady();
  const adminToken = ensureAdminToken();
  ensureValidImage(file);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("post_id", crypto.randomUUID());
  formData.append("photo_no", String(Math.max(1, slotNo)));
  formData.append("kind", "measurement");

  const response = await fetch(`${cdekProxyBaseUrl}/api/admin/media/main/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    body: formData,
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`TEASER_IMAGE_UPLOAD_FAILED ${response.status} ${text}`.trim());
  }

  let parsed: { ok?: boolean; url?: string } | null = null;
  try {
    parsed = text ? (JSON.parse(text) as { ok?: boolean; url?: string }) : null;
  } catch {
    parsed = null;
  }
  if (!parsed?.ok || !parsed.url) {
    throw new Error("TEASER_IMAGE_UPLOAD_INVALID_RESPONSE");
  }
  return parsed.url;
}

export async function saveActiveDropTeaser(payload: SaveDropTeaserPayload): Promise<void> {
  await ensureAdminRuntimeReady();
  const adminToken = ensureAdminToken();

  const response = await fetch(`${cdekProxyBaseUrl}/api/admin/drop-teaser/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`DROP_TEASER_SAVE_FAILED ${response.status} ${text}`.trim());
  }

  let parsed: { ok?: boolean } | null = null;
  try {
    parsed = text ? (JSON.parse(text) as { ok?: boolean }) : null;
  } catch {
    parsed = null;
  }
  if (!parsed?.ok) {
    throw new Error("DROP_TEASER_SAVE_INVALID_RESPONSE");
  }
}

