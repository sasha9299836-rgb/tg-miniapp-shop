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

function inferMediaTypeFromUrl(url: string): "image" | "video" {
  return /\.mp4(?:$|\?)/i.test(url) ? "video" : "image";
}

function inferMediaTypeFromFile(file: File): "image" | "video" | null {
  const mime = String(file.type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "video/mp4") return "video";
  const name = String(file.name ?? "").toLowerCase();
  if (/\.(jpg|jpeg|png|webp)$/i.test(name)) return "image";
  if (/\.mp4$/i.test(name)) return "video";
  return null;
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
  const [manualPackagingOverrideTypeKey, setManualPackagingOverrideTypeKey] = useState<string | null>(null);
  const [isTypeSuggestionsOpen, setIsTypeSuggestionsOpen] = useState(false);
  const [isBrandSuggestionsOpen, setIsBrandSuggestionsOpen] = useState(false);

  const fetchRequestId = useRef(0);
  const pendingUnsyncedUploadsRef = useRef<UploadedPhoto[]>([]);
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

  const mainPreview: PhotoPreviewItem[] = useMemo(
    () => mainPhotos.map((photo) => ({ id: photo.localId, photoNo: photo.photoNo, url: photo.url, mediaType: "image" })),
    [mainPhotos],
  );
  const defectPreview: PhotoPreviewItem[] = useMemo(
    () => defectPhotos.map((photo) => ({ id: photo.localId, photoNo: photo.photoNo, url: photo.url, mediaType: photo.mediaType })),
    [defectPhotos],
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
    return () => {
      const pending = pendingUnsyncedUploadsRef.current;
      if (!pending.length) return;
      void Promise.allSettled(pending.map((photo) => deleteYcObject(photo.key)));
    };
  }, []);

  const resetFormToEmpty = () => {
    fetchRequestId.current += 1;
    setPostType("warehouse");
    setNalichieIdInput("");
    setItemData(null);
    setCurrentPost(null);
    setMainPhotos([]);
    setDefectPhotos([]);
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
      setNalichieIdInput("");
      setItemData(null);
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

    for (const photo of unsyncedMain) {
      await createPostPhoto({
        post_id: postId,
        item_id: postType === "warehouse" ? normalizedNalichieId : null,
        photo_no: photo.photoNo,
        url: photo.url,
        storage_key: photo.key,
        sort_order: photo.photoNo - 1,
        kind: "main",
      });
    }

    for (const photo of unsyncedDefect) {
      await createPostDefectPhoto({
        post_id: postId,
        photo_no: photo.photoNo,
        storage_key: photo.key,
        public_url: photo.url,
        media_type: photo.mediaType,
      });
    }
  };

  const persistDraft = async (): Promise<TgPost> => {
    const validationError = validateDraftForm();
    if (validationError) throw new Error(validationError);
    if (postType === "warehouse") {
      const itemStatus = String(itemData?.status ?? "").trim();
      if (!itemData || !ALLOWED_NALICHIE_STATUSES.has(itemStatus)) {
        throw new Error("Выбранный товар недоступен для публикации. Разрешены только in_stock и in_transit.");
      }
    }

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

    await syncUploadedPhotosToPost(saved.id);
    hydrateFromPost(saved);
    await hydrateAllPhotosFromDb(saved.id);
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

  const uploadFiles = async (files: File[], kind: "main" | "defect") => {
    setErrorText(null);
    setSuccessText(null);
    if (!files.length) {
      setErrorText("Выберите хотя бы один файл.");
      return;
    }

    if (kind === "main") setIsUploadingPhotos(true);
    if (kind === "defect") setIsUploadingDefects(true);

    try {
      const list = kind === "main" ? mainPhotos : defectPhotos;
      let nextPhotoNo = list.reduce((max, photo) => Math.max(max, photo.photoNo), 0) + 1;
      const postIdForUpload = currentPost?.id ?? draftUploadId;
      const itemIdForStorage = postType === "warehouse" ? (currentPost?.item_id ?? normalizedNalichieId) : null;

      for (const file of files) {
        const mediaType = inferMediaTypeFromFile(file);
        if (!mediaType) {
          throw new Error(`Неподдерживаемый тип файла: ${file.name}`);
        }
        if (kind === "main" && mediaType !== "image") {
          throw new Error("Для основных фото разрешены только изображения.");
        }
        if (kind === "defect" && !(mediaType === "image" || mediaType === "video")) {
          throw new Error("Для медиа дефектов разрешены только изображения и MP4-видео.");
        }
        const photoNo = nextPhotoNo;
        nextPhotoNo += 1;
        const { url, publicUrl, key } = await getYcPresignedPut(postIdForUpload, itemIdForStorage, file, photoNo, kind);

        const uploadRes = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!(uploadRes.status === 200 || uploadRes.status === 204)) {
          throw new Error(`Ошибка загрузки файла ${file.name}: ${uploadRes.status}`);
        }

        const payload: UploadedPhoto = {
          localId: crypto.randomUUID(),
          photoNo,
          url: publicUrl,
          key,
          mediaType,
        };
        if (kind === "main") setMainPhotos((prev) => [...prev, payload]);
        if (kind === "defect") setDefectPhotos((prev) => [...prev, payload]);
      }

      setSuccessText(kind === "main" ? "Основные фотографии загружены." : "Медиа дефектов загружены.");
    } catch (error) {
      const message = (error as Error).message ?? "";
      if (message.includes("ALREADY_EXISTS") || message.includes("409")) {
        setErrorText("Медиа с таким номером уже загружено.");
      } else {
        setErrorText(`Ошибка загрузки медиа: ${message || "неизвестная ошибка"}`);
      }
    } finally {
      if (kind === "main") setIsUploadingPhotos(false);
      if (kind === "defect") setIsUploadingDefects(false);
    }
  };

  const onDeleteMainPhoto = async (localId: string) => {
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
      const targetPost = currentPost ?? await persistDraft();
      await schedulePost(targetPost.id, iso);
      resetFormToEmpty();
      if (isEditMode) nav("/admin/posts/new", { replace: true });
      setSuccessText(currentPost?.status === "scheduled" ? "Время публикации изменено." : "Пост запланирован.");
    } catch (error) {
      setErrorText(`Ошибка планирования: ${(error as Error).message}`);
    } finally {
      setIsScheduling(false);
    }
  };

  const onPublishNow = async () => {
    setErrorText(null);
    setSuccessText(null);
    if (mainPhotos.length < 1) {
      setErrorText("Для публикации нужно минимум 1 фото.");
      return;
    }

    setIsPublishingNow(true);
    try {
      const targetPost = currentPost ?? await persistDraft();
      await publishPostNow(targetPost.id);
      resetFormToEmpty();
      if (isEditMode) nav("/admin/posts/new", { replace: true });
      setSuccessText("Пост опубликован.");
    } catch (error) {
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
          loadingText={isUploadingPhotos ? "Загрузка фотографий..." : null}
          isBusy={isUploadingPhotos || isSaving || isPublishingNow || isScheduling}
          onSelect={(files) => void uploadFiles(files, "main")}
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
                  loadingText={isUploadingDefects ? "Загрузка медиа дефектов..." : null}
                  accept="image/*,video/mp4"
                  isBusy={isUploadingDefects || isSaving || isPublishingNow || isScheduling}
                  onSelect={(files) => void uploadFiles(files, "defect")}
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
          <Button onClick={() => void saveAsDraft()} disabled={isSaving || isUploadingPhotos || isUploadingDefects || isPublishingNow || isScheduling || isUnscheduling}>
            {isSaving ? "Сохраняем..." : "Сохранить черновик"}
          </Button>
          <Button variant="secondary" onClick={() => void onSchedule()} disabled={isScheduling || isSaving || isUnscheduling}>
            {isScheduling ? "Планируем..." : scheduleButtonLabel}
          </Button>
          <Button variant="secondary" onClick={() => void onPublishNow()} disabled={isPublishingNow || isSaving || isUnscheduling}>
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
      </div>
    </Page>
  );
}

export default AdminNewPostPage;
