import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../../shared/ui/Page";
import { Button } from "../../../shared/ui/Button";
import { ProductThumb } from "../../../shared/ui/ProductThumb";
import { getActiveDropTeaser } from "../../../shared/api/dropTeaserApi";
import {
  clearActiveDropTeaser,
  saveActiveDropTeaser,
  uploadDropTeaserImage,
} from "../../../shared/api/adminDropTeaserApi";
import "./styles.css";

const MAX_IMAGES = 4;

export function AdminDropTeaserPage() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [shortText, setShortText] = useState("");
  const [details, setDetails] = useState("");
  const [isPublicImmediately, setIsPublicImmediately] = useState(false);
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const teaser = await getActiveDropTeaser();
        if (cancelled || !teaser) return;
        setTitle(teaser.title);
        setShortText(teaser.shortText);
        setDetails(teaser.details ?? "");
        setIsPublicImmediately(teaser.isPublicImmediately);
        setCurrentImages(teaser.previewImages.slice(0, MAX_IMAGES));
      } catch {
        if (!cancelled) {
          setCurrentImages([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPreviews = useMemo(
    () => selectedFiles.map((file) => URL.createObjectURL(file)),
    [selectedFiles],
  );

  useEffect(() => {
    return () => {
      selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedPreviews]);

  const visibleImages = selectedPreviews.length ? selectedPreviews : currentImages;

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_IMAGES);
    setSelectedFiles(files);
    setErrorText(null);
    setSuccessText(null);
  };

  const onSave = async () => {
    const normalizedTitle = title.trim();
    const normalizedShortText = shortText.trim();
    const normalizedDetails = details.trim();
    if (!normalizedTitle) {
      setErrorText("Р’РІРµРґРёС‚Рµ Р·Р°РіРѕР»РѕРІРѕРє Р°РЅРѕРЅСЃР°.");
      return;
    }
    if (!normalizedShortText) {
      setErrorText("Р’РІРµРґРёС‚Рµ РєСЂР°С‚РєРёР№ С‚РµРєСЃС‚ Р°РЅРѕРЅСЃР°.");
      return;
    }

    setIsSaving(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      let previewImages = currentImages.slice(0, MAX_IMAGES);
      if (selectedFiles.length) {
        previewImages = [];
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const url = await uploadDropTeaserImage(selectedFiles[index], index + 1);
          previewImages.push(url);
        }
      }

      if (!previewImages.length) {
        throw new Error("Р”РѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ С„РѕС‚Рѕ РїСЂРµРІСЊСЋ.");
      }

      await saveActiveDropTeaser({
        title: normalizedTitle,
        short_text: normalizedShortText,
        details: normalizedDetails || null,
        preview_images: previewImages,
        is_public_immediately: isPublicImmediately,
      });

      setCurrentImages(previewImages);
      setSelectedFiles([]);
      setSuccessText("РџСЂРµРІСЊСЋ СЃРѕС…СЂР°РЅРµРЅРѕ Рё РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ РЅР° РіР»Р°РІРЅРѕР№.");
    } catch (error) {
      setErrorText(`РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂРµРІСЊСЋ: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const onClearActive = async () => {
    setIsClearing(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      await clearActiveDropTeaser();
      setTitle("");
      setShortText("");
      setDetails("");
      setIsPublicImmediately(false);
      setCurrentImages([]);
      setSelectedFiles([]);
      setSuccessText("РўРµРєСѓС‰РµРµ Р°РєС‚РёРІРЅРѕРµ РїСЂРµРІСЊСЋ СѓРґР°Р»РµРЅРѕ.");
    } catch (error) {
      setErrorText(`РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С‚РµРєСѓС‰РµРµ РїСЂРµРІСЊСЋ: ${(error as Error).message}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Page title="Р”РѕР±Р°РІРёС‚СЊ РїСЂРµРІСЊСЋ" subtitle="Р—Р°РіСЂСѓР·РёС‚Рµ РґРѕ 4 С„РѕС‚Рѕ Рё РєРѕСЂРѕС‚РєРёР№ Р°РЅРѕРЅСЃ Р±СѓРґСѓС‰РµРіРѕ РґСЂРѕРїР°">
      <section className="admin-drop-teaser">
        {currentImages.length || title.trim() || shortText.trim() || details.trim() ? (
          <div className="admin-drop-teaser__active-note">РўРµРєСѓС‰РµРµ Р°РєС‚РёРІРЅРѕРµ РїСЂРµРІСЊСЋ Р·Р°РіСЂСѓР¶РµРЅРѕ. Р’С‹ РјРѕР¶РµС‚Рµ РѕР±РЅРѕРІРёС‚СЊ РёР»Рё СѓРґР°Р»РёС‚СЊ РµРіРѕ.</div>
        ) : null}

        <label className="admin-drop-teaser__label">
          Р—Р°РіРѕР»РѕРІРѕРє
          <input
            className="admin-drop-teaser__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="РЎРєРѕСЂРѕ РЅРѕРІРѕРµ РїРѕСЃС‚СѓРїР»РµРЅРёРµ"
          />
        </label>

        <label className="admin-drop-teaser__label">
          РљСЂР°С‚РєРёР№ С‚РµРєСЃС‚
          <textarea
            className="admin-drop-teaser__textarea"
            value={shortText}
            onChange={(event) => setShortText(event.target.value)}
            placeholder="РљРѕСЂРѕС‚РєРѕ СЂР°СЃСЃРєР°Р¶РёС‚Рµ, С‡С‚Рѕ Р±СѓРґРµС‚ РІ РѕР±РЅРѕРІР»РµРЅРёРё."
            rows={3}
          />
        </label>

        <label className="admin-drop-teaser__label">
          Р”РµС‚Р°Р»Рё (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ)
          <textarea
            className="admin-drop-teaser__textarea"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ РґР»СЏ СЃС‚СЂР°РЅРёС†С‹ Р°РЅРѕРЅСЃР°."
            rows={4}
          />
        </label>

        <label className="admin-drop-teaser__label">
          Р¤РѕС‚РѕРіСЂР°С„РёРё РїСЂРµРІСЊСЋ (1вЂ“4)
          <input
            className="admin-drop-teaser__input"
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesSelected}
          />
        </label>
        <label className="admin-drop-teaser__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={isPublicImmediately}
            onChange={(event) => setIsPublicImmediately(event.target.checked)}
          />
          <span>Показать всем сразу</span>
        </label>
        {visibleImages.length ? (
          <div className={`admin-drop-teaser__gallery admin-drop-teaser__gallery--${Math.min(visibleImages.length, MAX_IMAGES)}`}>
            {visibleImages.map((image, index) => (
              <ProductThumb
                key={`preview-${index}`}
                src={image}
                alt={`РџСЂРµРІСЊСЋ ${index + 1}`}
                className="admin-drop-teaser__thumb"
                mediaClassName="admin-drop-teaser__thumb-media"
              />
            ))}
          </div>
        ) : null}

        <div className="admin-drop-teaser__actions">
          <Button onClick={() => void onSave()} disabled={isSaving || isLoading || isClearing}>
            {isSaving ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void onClearActive()}
            disabled={isSaving || isLoading || isClearing || (!currentImages.length && !title.trim() && !shortText.trim() && !details.trim())}
          >
            {isClearing ? "РЈРґР°Р»СЏРµРј..." : "РЈРґР°Р»РёС‚СЊ С‚РµРєСѓС‰РµРµ РїСЂРµРІСЊСЋ"}
          </Button>
          <Button variant="secondary" onClick={() => nav("/admin")}>
            РќР°Р·Р°Рґ
          </Button>
        </div>

        {errorText ? <div className="admin-drop-teaser__error">{errorText}</div> : null}
        {successText ? <div className="admin-drop-teaser__success">{successText}</div> : null}
      </section>
    </Page>
  );
}

export default AdminDropTeaserPage;


