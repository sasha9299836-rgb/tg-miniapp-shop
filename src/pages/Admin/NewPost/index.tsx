import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Page } from "../../../shared/ui/Page";
import { Button } from "../../../shared/ui/Button";
import { PhotoUploader, type PhotoPreviewItem } from "../../../shared/ui/PhotoUploader";
import { Field } from "../../../shared/ui/form/Field";
import {
  createOrUpdateDraftPost,
  createPostDefectPhoto,
  createPostPhoto,
  deletePostDefectPhoto,
  deletePostPhoto,
  fetchNalichieById,
  fetchNalichieByIdViaRpc,
  getPostById,
  getPostByItemId,
  getPostByNalichieId,
  getPostDefectPhotos,
  getPostPhotos,
  publishPostNow,
  schedulePost,
  unschedulePost,
  type NalichieItem,
  type TgPost,
  type TgPostOriginProfile,
  type TgPostPackagingPreset,
  type TgPostType,
} from "../../../shared/api/adminPostsApi";
import { deleteYcObject, getYcPresignedPut } from "../../../shared/api/ycApi";

const CONDITION_OPTIONS = [
  "10/10 Новая вещь",
  "10/10 Идеальное",
  "9,5/10 Близкое к идеальному",
  "9/10 Отличное",
  "8/10 Хорошее",
  "8,5/10 Хорошее",
  "7/10 Нормальное",
  "6/10 Удовлетворительное",
  "5/10",
  "4/10",
  "3/10",
  "2/10",
  "1/10",
];

const LEGACY_CONDITION_MAP: Record<string, string> = {
  "Новый": "10/10 Новая вещь",
  "Новая вещь": "10/10 Новая вещь",
  "Идеальное": "10/10 Идеальное",
  "Отличное": "9/10 Отличное",
  "Хорошее": "8/10 Хорошее",
  "Среднее": "6/10 Удовлетворительное",
  "Нормальное": "7/10 Нормальное",
  "Удовлетворительное": "6/10 Удовлетворительное",
};

const PACKAGING_OPTIONS: Array<{ value: TgPostPackagingPreset; label: string }> = [
  { value: "A4", label: "Пакет А4" },
  { value: "A3", label: "Пакет А3" },
  { value: "A2", label: "Пакет А2" },
];

const PACKAGING_BY_ITEM_TYPE: Record<string, TgPostPackagingPreset> = {
  "футболка": "A4",
  "поло": "A4",
  "кепка": "A4",
  "сумка": "A4",
  "лонгслив": "A4",
  "куртка": "A3",
  "зип-худи": "A3",
  "олимпийка": "A3",
  "ветровка": "A3",
  "пуховик": "A3",
  "штаны": "A3",
  "овершот": "A3",
  "джинсы": "A3",
  "свитшот": "A3",
  "харингтон": "A3",
  "бомбер": "A3",
  "рубашка": "A3",
  "худи": "A3",
  "шорты": "A3",
  "кардиган": "A3",
  "свитер": "A3",
  "регбийка": "A3",
  "рюкзак": "A3",
  "1/4 зип": "A3",
  "жилетка": "A3",
  "костюм": "A3",
};

const ITEM_TYPE_SUGGESTIONS = [
  "куртка",
  "зип-худи",
  "олимпийка",
  "ветровка",
  "пуховик",
  "штаны",
  "овершот",
  "джинсы",
  "свитшот",
  "футболка",
  "харингтон",
  "бомбер",
  "сумка",
  "поло",
  "рубашка",
  "лонгслив",
  "худи",
  "шорты",
  "кардиган",
  "кепка",
  "свитер",
  "регбийка",
  "рюкзак",
  "1/4 зип",
  "жилетка",
  "костюм",
] as const;

const BRAND_SUGGESTIONS = [
  "Ma.Strum",
  "C.P. Company",
  "Sergio Tacchini",
  "Marshall Artist",
  "Stone Island",
  "Evisu",
  "Fred Perry",
  "Alpha Industries",
  "Lonsdale",
  "Nemen",
  "Pit Bull",
  "Vetements",
  "Barbour",
  "Adidas",
  "Aquascutum",
  "Chrome Hearts",
  "Weekend Offender",
  "Polo Ralph Lauren",
  "Ellesse",
  "Shadow Balance",
  "Thor Steinar",
  "Tommy Hilfiger",
  "Lyle & Scott",
  "The North Face",
  "Berghaus",
  "Lacoste",
  "Hardcore United",
] as const;

const ALLOWED_NALICHIE_STATUSES = new Set(["in_stock", "in_transit"]);
const ENABLE_PUBLISH_DEBUG_OVERLAY = true;

function getOriginProfileByPostType(postType: TgPostType): TgPostOriginProfile {
  return postType === "consignment" ? "YAN" : "ODN";
}

function normalizeItemTypeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type UploadedPhoto = {
  localId: string;
  dbId?: string | number;
  photoNo: number;
  url: string;
  key: string;
  mediaType: "image" | "video";
};

type PendingUpload = {
  localId: string;
  file: File;
  photoNo: number;
  mediaType: "image" | "video";
  previewUrl: string;
  status: "validating" | "pending" | "uploading" | "failed";
};

const MAX_DEFECT_VIDEO_DURATION_SECONDS = 120;

function inferMediaTypeFromUrl(url: string): "image" | "video" {
  return /\.(mp4|mov)(?:$|\?)/i.test(url) ? "video" : "image";
}

function inferMediaTypeFromFile(file: File): "image" | "video" | null {
  const mime = String(file.type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "video/mp4" || mime === "video/quicktime") return "video";
  const name = String(file.name ?? "").toLowerCase();
  if (/\.(jpg|jpeg|png|webp)$/i.test(name)) return "image";
  if (/\.(mp4|mov)$/i.test(name)) return "video";
  return null;
}

function waitForAppToBeInteractive(): Promise<void> {
  return new Promise((resolve) => {
    const afterPaint = () => {
      window.setTimeout(resolve, 150);
    };

    const scheduleAfterPaint = () => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(afterPaint);
        });
        return;
      }
      window.setTimeout(afterPaint, 0);
    };

    const finishIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      cleanup();
      scheduleAfterPaint();
    };

    const cleanup = () => {
      document.removeEventListener("visibilitychange", finishIfVisible);
      window.removeEventListener("focus", finishIfVisible);
      window.removeEventListener("pageshow", finishIfVisible);
    };

    if (document.visibilityState === "visible") {
      scheduleAfterPaint();
      return;
    }

    document.addEventListener("visibilitychange", finishIfVisible);
    window.addEventListener("focus", finishIfVisible);
    window.addEventListener("pageshow", finishIfVisible);
  });
}

function readVideoDurationSeconds(previewUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Не удалось определить длительность видео."));
        return;
      }
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Не удалось прочитать длительность видео."));
    };
    video.src = previewUrl;
  });
}

function logUploadStep(localId: string, message: string, extra?: unknown) {
  if (extra === undefined) {
    console.debug(`[admin-media][${localId}] ${message}`);
    return;
  }
  console.debug(`[admin-media][${localId}] ${message}`, extra);
}

function logPublishStepConsole(message: string, extra?: unknown) {
  if (extra === undefined) {
    console.debug(`[admin-publish] ${message}`);
    return;
  }
  console.debug(`[admin-publish] ${message}`, extra);
}

function stringifyDebugExtra(extra: unknown): string {
  if (extra == null) return "";
  if (typeof extra === "string") return extra;
  if (extra instanceof Error) return extra.stack || extra.message;
  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}

function normalizeConditionValue(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return CONDITION_OPTIONS[0];
  if (CONDITION_OPTIONS.includes(raw)) return raw;
  return LEGACY_CONDITION_MAP[raw] ?? raw;
}

function moscowDateTimeLocalToIso(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const utcMs = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) - 3, Number(mm), 0);
  return new Date(utcMs).toISOString();
}

function toMoscowInputValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function statusLabel(status: TgPost["status"]) {
  if (status === "draft") return "Черновик";
  if (status === "scheduled") return "Запланирован";
  if (status === "published") return "Опубликован";
  return "Архив";
}

export function AdminNewPostPage() {
  const nav = useNavigate();
  const { id: editPostId } = useParams();
  const isEditMode = Boolean(editPostId);

  const [postType, setPostType] = useState<TgPostType>("warehouse");
  const [nalichieIdInput, setNalichieIdInput] = useState("");
  const [itemData, setItemData] = useState<NalichieItem | null>(null);
  const [currentPost, setCurrentPost] = useState<TgPost | null>(null);
  const [draftUploadId] = useState(() => crypto.randomUUID());
  const [mainPhotos, setMainPhotos] = useState<UploadedPhoto[]>([]);
  const [defectPhotos, setDefectPhotos] = useState<UploadedPhoto[]>([]);
  const [pendingMainUploads, setPendingMainUploads] = useState<PendingUpload[]>([]);
  const [pendingDefectUploads, setPendingDefectUploads] = useState<PendingUpload[]>([]);

  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0]);
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [hasDefects, setHasDefects] = useState(false);
  const [defectsText, setDefectsText] = useState("");
  const [scheduleAtInput, setScheduleAtInput] = useState("");
  const [packagingPreset, setPackagingPreset] = useState<TgPostPackagingPreset>("A3");

  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isUploadingDefects, setIsUploadingDefects] = useState(false);
  const [isPublishingNow, setIsPublishingNow] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isUnscheduling, setIsUnscheduling] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [publishDebugLog, setPublishDebugLog] = useState<string[]>([]);
  const [publishDebugError, setPublishDebugError] = useState<string | null>(null);
  const [manualPackagingOverrideTypeKey, setManualPackagingOverrideTypeKey] = useState<string | null>(null);
  const [isTypeSuggestionsOpen, setIsTypeSuggestionsOpen] = useState(false);
  const [isBrandSuggestionsOpen, setIsBrandSuggestionsOpen] = useState(false);

  const fetchRequestId = useRef(0);
  const pendingUnsyncedUploadsRef = useRef<UploadedPhoto[]>([]);
  const pendingMainUploadsRef = useRef<PendingUpload[]>([]);
  const pendingDefectUploadsRef = useRef<PendingUpload[]>([]);
  const pendingMainActivationRef = useRef<string | null>(null);
  const pendingDefectActivationRef = useRef<string | null>(null);
  const publishDebugSeqRef = useRef(0);
  const parsedNalichieId = useMemo(() => Number(nalichieIdInput), [nalichieIdInput]);
  const normalizedNalichieId = Number.isInteger(parsedNalichieId) && parsedNalichieId > 0 ? parsedNalichieId : null;
  const costPrice = useMemo(() => {
    if (postType !== "warehouse") return null;
    if (!itemData) return null;
    const obh = itemData.obh_summa ?? 0;
    if (obh > 0) return obh;
    const vikup = itemData.vikup_rub ?? 0;
    return vikup > 0 ? vikup : null;
  }, [itemData, postType]);
  const recommendedPrice = useMemo(() => {
    if (costPrice == null) return null;
    return Math.round(costPrice * 1.8);
  }, [costPrice]);
  const conditionOptions = useMemo(
    () => (CONDITION_OPTIONS.includes(condition) ? CONDITION_OPTIONS : [condition, ...CONDITION_OPTIONS]),
    [condition],
  );
  const normalizedItemTypeKey = useMemo(() => normalizeItemTypeKey(title), [title]);
  const mappedPackagingByType = useMemo(
    () => PACKAGING_BY_ITEM_TYPE[normalizedItemTypeKey] ?? null,
    [normalizedItemTypeKey],
  );
  const lastAutoAppliedTypeKey = useRef<string | null>(null);
  const filteredTypeSuggestions = useMemo(() => {
    const query = title.trim().toLowerCase();
    if (!query) return ITEM_TYPE_SUGGESTIONS.slice(0, 8);
    return ITEM_TYPE_SUGGESTIONS.filter((value) => value.toLowerCase().startsWith(query)).slice(0, 8);
  }, [title]);
  const filteredBrandSuggestions = useMemo(() => {
    const query = brand.trim().toLowerCase();
    if (!query) return BRAND_SUGGESTIONS.slice(0, 8);
    return BRAND_SUGGESTIONS.filter((value) => value.toLowerCase().startsWith(query)).slice(0, 8);
  }, [brand]);
  const hasPendingUploads = pendingMainUploads.length > 0 || pendingDefectUploads.length > 0;

  const logPublishStep = (message: string, extra?: unknown) => {
    logPublishStepConsole(message, extra);
    if (!ENABLE_PUBLISH_DEBUG_OVERLAY) return;
    const nextSeq = publishDebugSeqRef.current + 1;
    publishDebugSeqRef.current = nextSeq;
    const timestamp = new Date().toLocaleTimeString("ru-RU", { hour12: false });
    const details = stringifyDebugExtra(extra);
    const line = details
      ? `${nextSeq}. [${timestamp}] ${message} | ${details}`
      : `${nextSeq}. [${timestamp}] ${message}`;
    setPublishDebugLog((prev) => [...prev.slice(-39), line]);
  };

  const mainPreview: PhotoPreviewItem[] = useMemo(
    () => [
      ...mainPhotos.map((photo) => ({ id: photo.localId, photoNo: photo.photoNo, url: photo.url, mediaType: "image" as const, status: "uploaded" as const })),
      ...pendingMainUploads.map((upload) => ({
        id: upload.localId,
        photoNo: upload.photoNo,
        url: upload.previewUrl,
        mediaType: upload.mediaType,
        status: upload.status,
      })),
    ],
    [mainPhotos, pendingMainUploads],
  );
  const defectPreview: PhotoPreviewItem[] = useMemo(
    () => [
      ...defectPhotos.map((photo) => ({ id: photo.localId, photoNo: photo.photoNo, url: photo.url, mediaType: photo.mediaType, status: "uploaded" as const })),
      ...pendingDefectUploads.map((upload) => ({
        id: upload.localId,
        photoNo: upload.photoNo,
        url: upload.previewUrl,
        mediaType: upload.mediaType,
        status: upload.status,
      })),
    ],
    [defectPhotos, pendingDefectUploads],
  );

  const hydrateMainPhotosFromDb = async (postId: string) => {
    const rows = await getPostPhotos(postId);
    setMainPhotos(rows.map((photo) => ({
      localId: `db-${photo.id}`,
      dbId: photo.id,
      photoNo: photo.photo_no,
      url: photo.url,
      key: photo.storage_key,
      mediaType: "image",
    })));
  };

  const hydrateDefectPhotosFromDb = async (postId: string) => {
    const rows = await getPostDefectPhotos(postId);
    setDefectPhotos(rows.map((photo) => ({
      localId: `db-${photo.id}`,
      dbId: photo.id,
      photoNo: photo.photo_no,
      url: photo.public_url,
      key: photo.storage_key,
      mediaType: photo.media_type ?? inferMediaTypeFromUrl(photo.public_url),
    })));
  };

  const hydrateAllPhotosFromDb = async (postId: string) => {
    await Promise.all([hydrateMainPhotosFromDb(postId), hydrateDefectPhotosFromDb(postId)]);
  };

  useEffect(() => {
    pendingUnsyncedUploadsRef.current = [...mainPhotos, ...defectPhotos].filter((photo) => !photo.dbId);
  }, [mainPhotos, defectPhotos]);

  useEffect(() => {
    pendingMainUploadsRef.current = pendingMainUploads;
  }, [pendingMainUploads]);

  useEffect(() => {
    pendingDefectUploadsRef.current = pendingDefectUploads;
  }, [pendingDefectUploads]);

  useEffect(() => {
    return () => {
      const pending = pendingUnsyncedUploadsRef.current;
      if (!pending.length) return;
      void Promise.allSettled(pending.map((photo) => deleteYcObject(photo.key)));
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingMainUploadsRef.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      pendingDefectUploadsRef.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    };
  }, []);

  const resetFormToEmpty = () => {
    fetchRequestId.current += 1;
    pendingMainUploads.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    pendingDefectUploads.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    setPostType("warehouse");
    setNalichieIdInput("");
    setItemData(null);
    setCurrentPost(null);
    setMainPhotos([]);
    setDefectPhotos([]);
    setPendingMainUploads([]);
    setPendingDefectUploads([]);
    setTitle("");
    setBrand("");
    setDescription("");
    setCondition(CONDITION_OPTIONS[0]);
    setSize("");
    setPrice("");
    setHasDefects(false);
    setDefectsText("");
    setScheduleAtInput("");
    setPackagingPreset("A3");
    setFieldError(null);
    setIsAutoFetching(false);
    setIsTypeSuggestionsOpen(false);
    setIsBrandSuggestionsOpen(false);
    setManualPackagingOverrideTypeKey(null);
    lastAutoAppliedTypeKey.current = null;
  };

  const hydrateFromPost = (post: TgPost) => {
    const nextTypeKey = normalizeItemTypeKey(post.title);
    lastAutoAppliedTypeKey.current = nextTypeKey || null;
    setManualPackagingOverrideTypeKey(nextTypeKey || null);
    setCurrentPost(post);
    setPostType(post.post_type ?? "warehouse");
    setNalichieIdInput(post.nalichie_id == null ? "" : String(post.nalichie_id));
    setTitle(post.title);
    setBrand(post.brand ?? "");
    setDescription(post.description);
    setCondition(normalizeConditionValue(post.condition));
    setSize(post.size ?? "");
    setPrice(String(post.price));
    setHasDefects(post.has_defects);
    setDefectsText(post.defects_text ?? "");
    setScheduleAtInput(toMoscowInputValue(post.scheduled_at));
    setPackagingPreset(post.packaging_preset ?? "A3");
  };

  useEffect(() => {
    if (!mappedPackagingByType) return;

    const typeChanged = lastAutoAppliedTypeKey.current !== normalizedItemTypeKey;
    if (typeChanged) {
      setPackagingPreset(mappedPackagingByType);
      setManualPackagingOverrideTypeKey(null);
      lastAutoAppliedTypeKey.current = normalizedItemTypeKey;
      return;
    }

    if (manualPackagingOverrideTypeKey === normalizedItemTypeKey) {
      return;
    }

    setPackagingPreset((prev) => (prev === mappedPackagingByType ? prev : mappedPackagingByType));
  }, [mappedPackagingByType, normalizedItemTypeKey, manualPackagingOverrideTypeKey]);

  const loadByPostId = async (postId: string) => {
    setIsAutoFetching(true);
    setFieldError(null);
    try {
      const post = await getPostById(postId);
      if (!post) {
        setFieldError("Пост не найден.");
        return;
      }
      hydrateFromPost(post);
      await hydrateAllPhotosFromDb(post.id);
      const sourceNalichieId = post.post_type === "warehouse" ? (post.nalichie_id ?? post.item_id) : null;
      if (sourceNalichieId != null) {
        const nalichie = await fetchNalichieByIdViaRpc(sourceNalichieId) ?? await fetchNalichieById(sourceNalichieId);
        setItemData(nalichie);
      } else {
        setItemData(null);
      }
    } catch (error) {
      setFieldError(`Ошибка загрузки поста: ${(error as Error).message}`);
    } finally {
      setIsAutoFetching(false);
    }
  };

  const applyFetchedItem = async (nalichieIdValue: number, requestId: number) => {
    if (postType !== "warehouse") return;
    try {
      const foundItem = await fetchNalichieByIdViaRpc(nalichieIdValue) ?? await fetchNalichieById(nalichieIdValue);
      if (requestId !== fetchRequestId.current) return;

      if (!foundItem) {
        setItemData(null);
        setCurrentPost(null);
        setMainPhotos([]);
        setDefectPhotos([]);
        setFieldError("Товар с таким nalichie_id не найден в наличии.");
        return;
      }

      const itemStatus = String(foundItem.status ?? "").trim();
      if (!ALLOWED_NALICHIE_STATUSES.has(itemStatus)) {
        setItemData(null);
        setCurrentPost(null);
        setMainPhotos([]);
        setDefectPhotos([]);
        setFieldError("Товар недоступен для создания поста. Разрешены только in_stock и in_transit.");
        return;
      }

      setFieldError(null);
      setItemData(foundItem);
      const existing = await getPostByNalichieId(nalichieIdValue) ?? await getPostByItemId(nalichieIdValue);
      if (requestId !== fetchRequestId.current) return;

      if (existing) {
        hydrateFromPost(existing);
        await hydrateAllPhotosFromDb(existing.id);
      } else {
        const nextTitle = (foundItem.tip_veshi ?? "").trim();
        const nextDescription = (foundItem.opisanie_veshi ?? "").trim();
        const nextCondition = foundItem.defekt_marker ? CONDITION_OPTIONS[6] : CONDITION_OPTIONS[1];
        const nextCost = (foundItem.obh_summa ?? 0) > 0 ? Number(foundItem.obh_summa) : Number(foundItem.vikup_rub ?? 0);
        const suggestedPrice = nextCost > 0 ? Math.round(nextCost * 1.8) : null;
        setCurrentPost(null);
        setTitle((prev) => (prev.trim() ? prev : nextTitle));
        setBrand((prev) => (prev.trim() ? prev : (foundItem.brend ?? "")));
        setSize((prev) => (prev.trim() ? prev : (foundItem.razmer ?? "")));
        setDescription((prev) => (prev.trim() ? prev : nextDescription));
        setCondition((prev) => (prev.trim() ? prev : nextCondition));
        setHasDefects((prev) => prev || Boolean(foundItem.defekt_marker));
        setDefectsText((prev) => (prev.trim() ? prev : (foundItem.defekt_text ?? "")));
        setPrice((prev) => (prev.trim() ? prev : (suggestedPrice == null ? "" : String(suggestedPrice))));
      }
    } catch (error) {
      if (requestId !== fetchRequestId.current) return;
      setFieldError(`Ошибка загрузки: ${(error as Error).message}`);
    } finally {
      if (requestId === fetchRequestId.current) setIsAutoFetching(false);
    }
  };

  const startFetchById = (force = false) => {
    if (isEditMode) return;
    if (postType !== "warehouse") return;

    if (!nalichieIdInput.trim()) {
      fetchRequestId.current += 1;
      setFieldError(null);
      setItemData(null);
      setCurrentPost(null);
      return;
    }

    if (!Number.isInteger(parsedNalichieId) || parsedNalichieId <= 0) {
      if (force) setFieldError("Введите корректный nalichie_id.");
      return;
    }

    const requestId = fetchRequestId.current + 1;
    fetchRequestId.current = requestId;
    setIsAutoFetching(true);
    void applyFetchedItem(parsedNalichieId, requestId);
  };

  useEffect(() => {
    if (isEditMode || postType !== "warehouse") return;
    const timer = window.setTimeout(() => startFetchById(false), 350);
    return () => window.clearTimeout(timer);
  }, [nalichieIdInput, isEditMode, postType]);

  useEffect(() => {
    if (!editPostId) return;
    void loadByPostId(editPostId);
  }, [editPostId]);

  const validateDraftForm = () => {
    if (!title.trim()) return "Название обязательно.";
    if (!description.trim()) return "Описание обязательно.";
    if (!condition.trim()) return "Состояние обязательно.";
    if (!size.trim()) return "Размер обязателен.";
    const parsedPrice = Number(price);
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return "Цена должна быть числом больше 0.";
    if (hasDefects && !defectsText.trim()) return "Описание дефектов обязательно.";
    return null;
  };

  const onNalichieIdChange = (value: string) => setNalichieIdInput(value.replace(/\D/g, ""));

  const onPriceChange = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setPrice("");
      return;
    }
    setPrice(String(Number.parseInt(digits, 10)));
  };

  const onPostTypeChange = (nextType: TgPostType) => {
    setPostType(nextType);
    if (nextType === "consignment") {
      pendingMainUploads.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      pendingDefectUploads.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      setNalichieIdInput("");
      setItemData(null);
      setCurrentPost(null);
      setMainPhotos([]);
      setDefectPhotos([]);
      setPendingMainUploads([]);
      setPendingDefectUploads([]);
      setFieldError(null);
      return;
    }
    if (!isEditMode && nalichieIdInput.trim()) {
      startFetchById(false);
    }
  };

  const syncUploadedPhotosToPost = async (postId: string) => {
    const unsyncedMain = mainPhotos.filter((photo) => !photo.dbId);
    const unsyncedDefect = defectPhotos.filter((photo) => !photo.dbId);
    logPublishStep("syncUploadedPhotosToPost start", {
      postId,
      unsyncedMain: unsyncedMain.map((photo) => ({ localId: photo.localId, photoNo: photo.photoNo, key: photo.key })),
      unsyncedDefect: unsyncedDefect.map((photo) => ({ localId: photo.localId, photoNo: photo.photoNo, key: photo.key, mediaType: photo.mediaType })),
    });

    for (const photo of unsyncedMain) {
      logPublishStep("createPostPhoto start", { postId, localId: photo.localId, photoNo: photo.photoNo, key: photo.key });
      const created = await createPostPhoto({
        post_id: postId,
        item_id: postType === "warehouse" ? normalizedNalichieId : null,
        photo_no: photo.photoNo,
        url: photo.url,
        storage_key: photo.key,
        sort_order: photo.photoNo - 1,
        kind: "main",
      });
      logPublishStep("createPostPhoto success", { postId, localId: photo.localId, dbId: created.id });
      setMainPhotos((prev) => prev.map((entry) => (
        entry.localId === photo.localId ? { ...entry, dbId: created.id } : entry
      )));
    }

    for (const photo of unsyncedDefect) {
      logPublishStep("createPostDefectPhoto start", {
        postId,
        localId: photo.localId,
        photoNo: photo.photoNo,
        key: photo.key,
        mediaType: photo.mediaType,
      });
      const created = await createPostDefectPhoto({
        post_id: postId,
        photo_no: photo.photoNo,
        storage_key: photo.key,
        public_url: photo.url,
        media_type: photo.mediaType,
      });
      logPublishStep("createPostDefectPhoto success", { postId, localId: photo.localId, dbId: created.id });
      setDefectPhotos((prev) => prev.map((entry) => (
        entry.localId === photo.localId ? { ...entry, dbId: created.id } : entry
      )));
    }
    logPublishStep("syncUploadedPhotosToPost finish", { postId });
  };

  const persistDraft = async (): Promise<TgPost> => {
    const validationError = validateDraftForm();
    if (validationError) throw new Error(validationError);
    if (postType === "warehouse") {
      const itemStatus = String(itemData?.status ?? "").trim();
      if (!itemData || !ALLOWED_NALICHIE_STATUSES.has(itemStatus)) {
        throw new Error("Выбранный товар недоступен для публикации. Разрешены только in_stock и in_transit.");
      }
      const targetItemId = currentPost?.item_id ?? normalizedNalichieId;
      if (!Number.isInteger(targetItemId) || Number(targetItemId) <= 0) {
        throw new Error("Не удалось определить item_id/nalichie_id для складского поста.");
      }
    }

    logPublishStep("createOrUpdateDraftPost start", {
      currentPostId: currentPost?.id ?? null,
      postType,
      normalizedNalichieId,
      hasDefects,
      mainPhotos: mainPhotos.map((photo) => ({ localId: photo.localId, dbId: photo.dbId ?? null, photoNo: photo.photoNo })),
      defectPhotos: defectPhotos.map((photo) => ({ localId: photo.localId, dbId: photo.dbId ?? null, photoNo: photo.photoNo, mediaType: photo.mediaType })),
    });

    const saved = await createOrUpdateDraftPost({
      item_id: postType === "warehouse" ? (currentPost?.item_id ?? normalizedNalichieId) : null,
      nalichie_id: postType === "warehouse" ? normalizedNalichieId : null,
      post_type: postType,
      origin_profile: getOriginProfileByPostType(postType),
      packaging_preset: packagingPreset,
      title: title.trim(),
      brand: brand.trim() || null,
      size: size.trim() || null,
      price: Number(price),
      description: description.trim(),
      condition: condition.trim(),
      has_defects: hasDefects,
      defects_text: hasDefects ? defectsText.trim() : null,
      scheduled_at: moscowDateTimeLocalToIso(scheduleAtInput),
      current_status: currentPost?.status,
      current_published_at: currentPost?.published_at ?? null,
    }, currentPost?.id);
    logPublishStep("createOrUpdateDraftPost success", { savedId: saved.id, status: saved.status });

    await syncUploadedPhotosToPost(saved.id);
    logPublishStep("persistDraft hydrateFromPost", { savedId: saved.id });
    hydrateFromPost(saved);
    return saved;
  };

  const saveAsDraft = async () => {
    setErrorText(null);
    setSuccessText(null);
    setIsSaving(true);
    try {
      await persistDraft();
      resetFormToEmpty();
      if (isEditMode) nav("/admin/posts/new", { replace: true });
      setSuccessText("Черновик сохранен.");
    } catch (error) {
      setErrorText(`Ошибка сохранения: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const stageSelectedFiles = (files: File[], kind: "main" | "defect") => {
    setErrorText(null);
    setSuccessText(null);
    if (!files.length) {
      setErrorText("Выберите хотя бы один файл.");
      return;
    }

    const uploadedList = kind === "main" ? mainPhotos : defectPhotos;
    const pendingList = kind === "main" ? pendingMainUploads : pendingDefectUploads;
    let nextPhotoNo = [...uploadedList, ...pendingList].reduce((max, photo) => Math.max(max, photo.photoNo), 0) + 1;
    const staged: PendingUpload[] = [];

    for (const file of files) {
      const mediaType = inferMediaTypeFromFile(file);
      if (!mediaType) {
        setErrorText(`Неподдерживаемый тип файла: ${file.name}`);
        continue;
      }
      if (kind === "main" && mediaType !== "image") {
        setErrorText("Для основных фото разрешены только изображения.");
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      staged.push({
        localId: crypto.randomUUID(),
        file,
        photoNo: nextPhotoNo,
        mediaType,
        previewUrl,
        status: mediaType === "video" ? "validating" : "pending",
      });
      logUploadStep(staged[staged.length - 1].localId, `selected ${kind}`, {
        fileName: file.name,
        mediaType,
        status: staged[staged.length - 1].status,
      });
      nextPhotoNo += 1;
    }

    if (!staged.length) return;
    if (kind === "main") setPendingMainUploads((prev) => [...prev, ...staged]);
    if (kind === "defect") setPendingDefectUploads((prev) => [...prev, ...staged]);
  };

  useEffect(() => {
    const next = pendingDefectUploads.find((entry) => entry.status === "validating" && entry.mediaType === "video");
    if (!next) return;

    let cancelled = false;

    void (async () => {
      try {
        logUploadStep(next.localId, "video validation wait start", { fileName: next.file.name });
        await waitForAppToBeInteractive();
        if (cancelled) return;
        logUploadStep(next.localId, "video validation metadata read start");
        const durationSeconds = await readVideoDurationSeconds(next.previewUrl);
        if (cancelled) return;
        logUploadStep(next.localId, "video validation metadata read finish", { durationSeconds });
        if (durationSeconds > MAX_DEFECT_VIDEO_DURATION_SECONDS) {
          URL.revokeObjectURL(next.previewUrl);
          setPendingDefectUploads((prev) => prev.filter((entry) => entry.localId !== next.localId));
          setErrorText("Видео дефекта должно быть не длиннее 2 минут.");
          logUploadStep(next.localId, "video validation rejected by duration");
          return;
        }
        setPendingDefectUploads((prev) => prev.map((entry) => (
          entry.localId === next.localId ? { ...entry, status: "pending" } : entry
        )));
        logUploadStep(next.localId, "video validation passed -> pending");
      } catch (error) {
        if (cancelled) return;
        URL.revokeObjectURL(next.previewUrl);
        setPendingDefectUploads((prev) => prev.filter((entry) => entry.localId !== next.localId));
        setErrorText((error as Error).message || "Не удалось проверить длительность видео.");
        logUploadStep(next.localId, "video validation failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingDefectUploads]);

  const uploadPendingItem = async (item: PendingUpload, kind: "main" | "defect") => {
    const postIdForUpload = currentPost?.id ?? draftUploadId;
    const itemIdForStorage = postType === "warehouse" ? (currentPost?.item_id ?? normalizedNalichieId) : null;
    logUploadStep(item.localId, "presign start", {
      kind,
      fileName: item.file.name,
      mimeType: item.file.type,
      photoNo: item.photoNo,
      postIdForUpload,
      itemIdForStorage,
    });
    const { url, publicUrl, key } = await getYcPresignedPut(postIdForUpload, itemIdForStorage, item.file, item.photoNo, kind);
    logUploadStep(item.localId, "presign success", { key, publicUrl });

    logUploadStep(item.localId, "put upload start");
    const uploadRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": item.file.type || "application/octet-stream" },
      body: item.file,
    });
    logUploadStep(item.localId, "put upload finish", { status: uploadRes.status });

    if (!(uploadRes.status === 200 || uploadRes.status === 204)) {
      throw new Error(`Ошибка загрузки файла ${item.file.name}: ${uploadRes.status}`);
    }

    const payload: UploadedPhoto = {
      localId: crypto.randomUUID(),
      photoNo: item.photoNo,
      url: publicUrl,
      key,
      mediaType: item.mediaType,
    };
    if (kind === "main") setMainPhotos((prev) => [...prev, payload]);
    if (kind === "defect") setDefectPhotos((prev) => [...prev, payload]);
    logUploadStep(item.localId, "local state updated -> uploaded");
    setSuccessText(kind === "main" ? "Основные фотографии загружены." : "Медиа дефектов загружены.");
  };

  useEffect(() => {
    if (isUploadingPhotos || pendingMainActivationRef.current) return;
    const next = pendingMainUploads.find((entry) => entry.status === "pending");
    if (!next) return;
    pendingMainActivationRef.current = next.localId;
    void (async () => {
      try {
        logUploadStep(next.localId, "main upload wait start");
        await waitForAppToBeInteractive();
        logUploadStep(next.localId, "main upload wait finish");
        setPendingMainUploads((prev) => prev.map((entry) => (
          entry.localId === next.localId ? { ...entry, status: "uploading" } : entry
        )));
        setIsUploadingPhotos(true);
        await uploadPendingItem(next, "main");
        URL.revokeObjectURL(next.previewUrl);
        setPendingMainUploads((prev) => prev.filter((entry) => entry.localId !== next.localId));
        logUploadStep(next.localId, "main upload completed");
      } catch (error) {
        logUploadStep(next.localId, "main upload failed", error);
        const message = (error as Error).message ?? "";
        if (message.includes("ALREADY_EXISTS") || message.includes("409")) {
          setErrorText("Медиа с таким номером уже загружено.");
        } else {
          setErrorText(`Ошибка загрузки медиа: ${message || "неизвестная ошибка"}`);
        }
        setPendingMainUploads((prev) => prev.map((entry) => (
          entry.localId === next.localId ? { ...entry, status: "failed" } : entry
        )));
      } finally {
        pendingMainActivationRef.current = null;
        setIsUploadingPhotos(false);
      }
    })();
  }, [pendingMainUploads, isUploadingPhotos, currentPost?.id, currentPost?.item_id, draftUploadId, postType, normalizedNalichieId]);

  useEffect(() => {
    if (isUploadingDefects || pendingDefectActivationRef.current) return;
    const next = pendingDefectUploads.find((entry) => entry.status === "pending");
    if (!next) return;
    pendingDefectActivationRef.current = next.localId;
    void (async () => {
      try {
        logUploadStep(next.localId, "defect upload wait start");
        await waitForAppToBeInteractive();
        logUploadStep(next.localId, "defect upload wait finish");
        setPendingDefectUploads((prev) => prev.map((entry) => (
          entry.localId === next.localId ? { ...entry, status: "uploading" } : entry
        )));
        setIsUploadingDefects(true);
        await uploadPendingItem(next, "defect");
        URL.revokeObjectURL(next.previewUrl);
        setPendingDefectUploads((prev) => prev.filter((entry) => entry.localId !== next.localId));
        logUploadStep(next.localId, "defect upload completed");
      } catch (error) {
        logUploadStep(next.localId, "defect upload failed", error);
        const message = (error as Error).message ?? "";
        if (message.includes("ALREADY_EXISTS") || message.includes("409")) {
          setErrorText("Медиа с таким номером уже загружено.");
        } else {
          setErrorText(`Ошибка загрузки медиа: ${message || "неизвестная ошибка"}`);
        }
        setPendingDefectUploads((prev) => prev.map((entry) => (
          entry.localId === next.localId ? { ...entry, status: "failed" } : entry
        )));
      } finally {
        pendingDefectActivationRef.current = null;
        setIsUploadingDefects(false);
      }
    })();
  }, [pendingDefectUploads, isUploadingDefects, currentPost?.id, currentPost?.item_id, draftUploadId, postType, normalizedNalichieId]);

  const onDeleteMainPhoto = async (localId: string) => {
    const pending = pendingMainUploads.find((entry) => entry.localId === localId);
    if (pending) {
      URL.revokeObjectURL(pending.previewUrl);
      setPendingMainUploads((prev) => prev.filter((entry) => entry.localId !== localId));
      return;
    }
    const photo = mainPhotos.find((entry) => entry.localId === localId);
    if (!photo) return;
    setErrorText(null);
    setSuccessText(null);
    try {
      await deleteYcObject(photo.key);
      if (photo.dbId && currentPost) {
        await deletePostPhoto(String(photo.dbId));
        await hydrateMainPhotosFromDb(currentPost.id);
        return;
      }
      setMainPhotos((prev) => prev.filter((entry) => entry.localId !== localId));
    } catch (error) {
      setErrorText(`Ошибка удаления фото: ${(error as Error).message}`);
    }
  };

  const onDeleteDefectPhoto = async (localId: string) => {
    const pending = pendingDefectUploads.find((entry) => entry.localId === localId);
    if (pending) {
      URL.revokeObjectURL(pending.previewUrl);
      setPendingDefectUploads((prev) => prev.filter((entry) => entry.localId !== localId));
      return;
    }
    const photo = defectPhotos.find((entry) => entry.localId === localId);
    if (!photo) return;
    setErrorText(null);
    setSuccessText(null);
    try {
      await deleteYcObject(photo.key);
      if (photo.dbId && currentPost) {
        await deletePostDefectPhoto(Number(photo.dbId));
        await hydrateDefectPhotosFromDb(currentPost.id);
        return;
      }
      setDefectPhotos((prev) => prev.filter((entry) => entry.localId !== localId));
    } catch (error) {
      setErrorText(`Ошибка удаления фото: ${(error as Error).message}`);
    }
  };

  const onSchedule = async () => {
    setErrorText(null);
    setSuccessText(null);
    const iso = moscowDateTimeLocalToIso(scheduleAtInput);
    if (!iso) {
      setErrorText("Укажите корректное время публикации.");
      return;
    }

    setIsScheduling(true);
    try {
      logPublishStep("schedule flow start", { currentPostId: currentPost?.id ?? null });
      const targetPost = await persistDraft();
      logPublishStep("schedulePost start", { postId: targetPost.id, iso });
      await schedulePost(targetPost.id, iso);
      logPublishStep("schedulePost success", { postId: targetPost.id });
      resetFormToEmpty();
      if (isEditMode) nav("/admin/posts/new", { replace: true });
      setSuccessText(currentPost?.status === "scheduled" ? "Время публикации изменено." : "Пост запланирован.");
    } catch (error) {
      logPublishStep("schedule flow failed", error);
      setErrorText(`Ошибка планирования: ${(error as Error).message}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const onPublishNow = async () => {
    setErrorText(null);
    setSuccessText(null);
    if (ENABLE_PUBLISH_DEBUG_OVERLAY) {
      publishDebugSeqRef.current = 0;
      setPublishDebugLog([]);
      setPublishDebugError(null);
    }
    if (mainPhotos.length < 1) {
      setErrorText("Для публикации нужно минимум 1 фото.");
      return;
    }

    setIsPublishingNow(true);
    try {
      logPublishStep("publish flow start", { currentPostId: currentPost?.id ?? null });
      const targetPost = await persistDraft();
      logPublishStep("publishPostNow start", { postId: targetPost.id });
      await publishPostNow(targetPost.id);
      logPublishStep("publishPostNow success", { postId: targetPost.id });
      resetFormToEmpty();
      if (isEditMode) nav("/admin/posts/new", { replace: true });
      setSuccessText("Пост опубликован.");
    } catch (error) {
      logPublishStep("publish flow failed", error);
      if (ENABLE_PUBLISH_DEBUG_OVERLAY) {
        setPublishDebugError(stringifyDebugExtra(error));
      }
      setErrorText(`Ошибка публикации: ${(error as Error).message}`);
    } finally {
      setIsPublishingNow(false);
    }
  };

  const onReturnToDraft = async () => {
    if (!currentPost) return;
    setErrorText(null);
    setSuccessText(null);
    setIsUnscheduling(true);
    try {
      const updated = await unschedulePost(currentPost.id);
      hydrateFromPost(updated);
      setSuccessText("Пост возвращен в черновики.");
    } catch (error) {
      setErrorText(`Ошибка возврата в черновики: ${(error as Error).message}`);
    } finally {
      setIsUnscheduling(false);
    }
  };

  const scheduleButtonLabel = currentPost?.status === "scheduled"
    ? "Изменить время"
    : "Запланировать";
  const showWarehouseSelector = postType === "warehouse";
  const canRenderProductForm = true;

  return (
    <Page
      title={isEditMode ? "Редактирование поста" : "Новый пост"}
      subtitle="Создание и публикация товара"
    >
      <div style={{ display: "grid", gap: 12, width: "100%", minWidth: 0 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Тип размещения">
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name="post_type" value="warehouse" checked={postType === "warehouse"} onChange={() => onPostTypeChange("warehouse")} />
                {"Одинцово"}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name="post_type" value="consignment" checked={postType === "consignment"} onChange={() => onPostTypeChange("consignment")} />
                {"Янино-1"}
              </label>
            </div>
          </Field>

          {showWarehouseSelector ? (
            <Field label="nalichie_id">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={nalichieIdInput}
                disabled={isEditMode}
                onChange={(e) => onNalichieIdChange(e.target.value)}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                onBlur={() => startFetchById(true)}
                placeholder={"Введите nalichie_id для автозаполнения"}
                style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
              />
            </Field>
          ) : null}

          {isAutoFetching ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {"Загрузка товара..."}
            </div>
          ) : null}
          {fieldError ? <div style={{ color: "#b42318", fontSize: 13 }}>{fieldError}</div> : null}
        </div>

        {showWarehouseSelector && itemData ? (
          <div className="glass" style={{ padding: 12, display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 700 }}>{"Товар из наличия"}</div>
            <div>ID: {itemData.id}</div>
            <div>{"Тип вещи"}: {itemData.tip_veshi || "—"}</div>
            <div>{"Бренд"}: {itemData.brend || "—"}</div>
            <div>{"Размер"}: {itemData.razmer || "—"}</div>
            <div>{"Себестоимость"}: {costPrice ?? "—"}</div>
            <div>{"Рекомендованная цена"}: {recommendedPrice == null ? "—" : `${recommendedPrice} ₽`}</div>
            {currentPost ? <div>{"Статус"}: {statusLabel(currentPost.status)}</div> : null}
          </div>
        ) : null}

        <PhotoUploader
          title={"Основные фотографии"}
          inputId="post-main-files"
          selectLabel={"Выбрать файлы"}
          items={mainPreview}
          loadingText={isUploadingPhotos ? "Загрузка фотографий..." : pendingMainUploads.length ? "Файлы добавлены в очередь." : null}
          isBusy={isUploadingPhotos || isSaving || isPublishingNow || isScheduling}
          onSelect={(files) => stageSelectedFiles(files, "main")}
          onRemove={(id) => void onDeleteMainPhoto(id)}
        />

        {!canRenderProductForm ? (
          <div className="glass" style={{ padding: 12, color: "var(--muted)" }}>
            {"Выберите товар со склада, чтобы заполнить карточку поста."}
          </div>
        ) : null}

        {canRenderProductForm ? (
          <div style={{ display: "grid", gap: 16 }}>
            <Field label={"Тип вещи"}>
              <div style={{ position: "relative" }}>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsTypeSuggestionsOpen(true);
                  }}
                  onFocus={() => setIsTypeSuggestionsOpen(true)}
                  onBlur={() => window.setTimeout(() => setIsTypeSuggestionsOpen(false), 120)}
                  placeholder={"худи, свитшот"}
                  style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
                />
                {isTypeSuggestionsOpen && filteredTypeSuggestions.length ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      zIndex: 5,
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "var(--surface)",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {filteredTypeSuggestions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setTitle(option);
                          setIsTypeSuggestionsOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: 0,
                          background: "transparent",
                          padding: "8px 10px",
                          cursor: "pointer",
                          color: "var(--text)",
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
            <Field label={"Бренд"}>
              <div style={{ position: "relative" }}>
                <input
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setIsBrandSuggestionsOpen(true);
                  }}
                  onFocus={() => setIsBrandSuggestionsOpen(true)}
                  onBlur={() => window.setTimeout(() => setIsBrandSuggestionsOpen(false), 120)}
                  placeholder={"Nike"}
                  style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
                />
                {isBrandSuggestionsOpen && filteredBrandSuggestions.length ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      zIndex: 5,
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "var(--surface)",
                      boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {filteredBrandSuggestions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setBrand(option);
                          setIsBrandSuggestionsOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: 0,
                          background: "transparent",
                          padding: "8px 10px",
                          cursor: "pointer",
                          color: "var(--text)",
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
            <Field label={"Описание"}>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={"Легкая, приятный хлопок"} rows={4} style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }} />
            </Field>
            <Field label={"Состояние"}>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}>
                {conditionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === condition && !CONDITION_OPTIONS.includes(option) ? `${option} (устаревшее значение)` : option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={"Размер"}>
              <input value={size} onChange={(e) => setSize(e.target.value)} placeholder={"XL"} style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }} />
            </Field>
            <Field label={"Цена"}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={price}
                onChange={(e) => onPriceChange(e.target.value)}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                placeholder={"Цена"}
                style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
              />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={hasDefects} onChange={(e) => setHasDefects(e.target.checked)} />
              {"Есть дефекты?"}
            </label>
            {hasDefects ? (
              <>
                <Field label={"Описание дефектов"}>
                  <textarea value={defectsText} onChange={(e) => setDefectsText(e.target.value)} placeholder={"Описание дефектов"} rows={3} style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }} />
                </Field>
                <PhotoUploader
                  title={"Медиа дефектов"}
                  inputId="post-defect-files"
                  selectLabel={"Выбрать фото/видео дефектов"}
                  items={defectPreview}
                  loadingText={isUploadingDefects ? "Загрузка медиа дефектов..." : pendingDefectUploads.length ? "Файлы добавлены в очередь." : null}
                  accept="image/*,video/mp4,video/quicktime,.mov"
                  isBusy={isUploadingDefects || isSaving || isPublishingNow || isScheduling}
                  onSelect={(files) => stageSelectedFiles(files, "defect")}
                  onRemove={(id) => void onDeleteDefectPhoto(id)}
                />
              </>
            ) : null}
            <Field label={"Упаковка"}>
              <select
                value={packagingPreset}
                onChange={(e) => {
                  const nextValue = e.target.value as TgPostPackagingPreset;
                  setPackagingPreset(nextValue);
                  if (!normalizedItemTypeKey) {
                    setManualPackagingOverrideTypeKey(null);
                    return;
                  }
                  const suggested = PACKAGING_BY_ITEM_TYPE[normalizedItemTypeKey] ?? null;
                  if (suggested && suggested !== nextValue) {
                    setManualPackagingOverrideTypeKey(normalizedItemTypeKey);
                    return;
                  }
                  setManualPackagingOverrideTypeKey(null);
                }}
                style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
              >
                {PACKAGING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        <div className="glass" style={{ padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>{"Отложенная публикация"}</div>
          <input
            type="datetime-local"
            value={scheduleAtInput}
            onChange={(e) => setScheduleAtInput(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <Button onClick={() => void saveAsDraft()} disabled={isSaving || isUploadingPhotos || isUploadingDefects || hasPendingUploads || isPublishingNow || isScheduling || isUnscheduling}>
            {isSaving ? "Сохраняем..." : "Сохранить черновик"}
          </Button>
          <Button variant="secondary" onClick={() => void onSchedule()} disabled={isScheduling || isSaving || isUploadingPhotos || isUploadingDefects || hasPendingUploads || isUnscheduling}>
            {isScheduling ? "Планируем..." : scheduleButtonLabel}
          </Button>
          <Button variant="secondary" onClick={() => void onPublishNow()} disabled={isPublishingNow || isSaving || isUploadingPhotos || isUploadingDefects || hasPendingUploads || isUnscheduling}>
            {isPublishingNow ? "Публикуем..." : "Опубликовать пост"}
          </Button>
          {currentPost?.status === "scheduled" ? (
            <Button variant="secondary" onClick={() => void onReturnToDraft()} disabled={isUnscheduling || isSaving}>
              {isUnscheduling ? "Обновление..." : "Вернуть в черновики"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => nav("/admin/posts/scheduled")}>{"Назад"}</Button>
        </div>
        {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}
        {successText ? <div style={{ color: "#067647" }}>{successText}</div> : null}
        {ENABLE_PUBLISH_DEBUG_OVERLAY && publishDebugError ? (
          <div className="glass" style={{ padding: 12, display: "grid", gap: 8, border: "1px solid rgba(180,35,24,0.35)" }}>
            <div style={{ fontWeight: 700, color: "#b42318" }}>{"Publish Debug (temporary)"}</div>
            <div style={{ fontSize: 13, color: "#b42318", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {publishDebugError}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{"Последние шаги:"}</div>
            <div style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {publishDebugLog.length ? publishDebugLog.map((line) => (
                <div key={line} style={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {line}
                </div>
              )) : (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{"Логи publish пока не собраны."}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  );
}

export default AdminNewPostPage;
