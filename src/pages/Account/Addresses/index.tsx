import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../../shared/ui/Page";
import { Card } from "../../../shared/ui/Card";
import { Input } from "../../../shared/ui/Input";
import { Button } from "../../../shared/ui/Button";
import { ListItem } from "../../../shared/ui/ListItem";
import { FioInput } from "../../../shared/ui/inputs/FioInput";
import { PhoneInput } from "../../../shared/ui/inputs/PhoneInput";
import { isTgIdentityRequiredError, TG_IDENTITY_REQUIRED_MESSAGE } from "../../../shared/auth/tgUser";
import type { PickupPoint } from "../../../shared/api/shipping.repository";
import { cdekProxyShippingRepository as shipping } from "../../../shared/api/shipping.cdekProxy";
import {
  deleteAddressPreset,
  listAddressPresets,
  readSelectedPresetId,
  saveSelectedPresetId,
  upsertAddressPreset,
  type TgAddressPreset,
} from "../../../shared/api/addressPresetsApi";
import { loadTelegramUserProfile, type TgUserRecord } from "../../../shared/api/telegramUsersApi";
import "./styles.css";

type AddressForm = {
  name: string;
  recipientFio: string;
  recipientPhone: string;
  isDefault: boolean;
};

type SearchCityOption = {
  code: string | null;
  label: string;
  region: string;
};

const EMPTY_FORM: AddressForm = {
  name: "",
  recipientFio: "",
  recipientPhone: "",
  isDefault: false,
};

function mapAddressToForm(address: TgAddressPreset): AddressForm {
  return {
    name: address.name,
    recipientFio: address.recipient_fio,
    recipientPhone: address.recipient_phone,
    isDefault: address.is_default,
  };
}

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return {
    message: e.message ?? null,
    details: e.details ?? null,
    hint: e.hint ?? null,
    code: e.code ?? null,
  };
}

function formatAddressSubtitle(address: TgAddressPreset) {
  const city = String(address.city ?? "").trim();
  const pvz = String(address.pvz ?? "").trim();
  if (!pvz) return city ? `${city}, РџР’Р— РЅРµ РІС‹Р±СЂР°РЅ` : "РџР’Р— РЅРµ РІС‹Р±СЂР°РЅ";
  return city ? `${city}, ${pvz}` : pvz;
}

function normalizeCities(parsed: unknown): SearchCityOption[] {
  const source =
    Array.isArray(parsed) ? parsed :
    Array.isArray((parsed as { data?: unknown })?.data) ? (parsed as { data: unknown[] }).data :
    Array.isArray((parsed as { items?: unknown })?.items) ? (parsed as { items: unknown[] }).items :
    Array.isArray((parsed as { result?: unknown })?.result) ? (parsed as { result: unknown[] }).result :
    Array.isArray((parsed as { cities?: unknown })?.cities) ? (parsed as { cities: unknown[] }).cities :
    Array.isArray((parsed as { data?: { cities?: unknown } })?.data?.cities) ? (parsed as { data: { cities: unknown[] } }).data.cities :
    [];

  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (item == null) return null;
      if (typeof item === "string") {
        return { code: null, label: item.trim(), region: "" };
      }
      if (typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label =
        String(
          row.name ??
          row.city ??
          row.title ??
          row.full_name ??
          row.value ??
          "",
        ).trim();
      if (!label) return null;
      const rawCode = row.code ?? row.id ?? row.city_code ?? row.fias_id ?? row.guid ?? null;
      return {
        code: rawCode == null ? null : String(rawCode),
        label,
        region: String(row.region ?? row.region_name ?? row.area ?? "").trim(),
      };
    })
    .filter((item): item is SearchCityOption => Boolean(item));
}

function normalizePvz(parsed: unknown): PickupPoint[] {
  const source =
    Array.isArray(parsed) ? parsed :
    Array.isArray((parsed as { data?: unknown })?.data) ? (parsed as { data: unknown[] }).data :
    Array.isArray((parsed as { items?: unknown })?.items) ? (parsed as { items: unknown[] }).items :
    Array.isArray((parsed as { result?: unknown })?.result) ? (parsed as { result: unknown[] }).result :
    [];

  if (!Array.isArray(source)) return [];

  return source
    .map((item): PickupPoint | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? "").trim();
      const name = String(row.name ?? row.title ?? code).trim();
      if (!code || !name) return null;
      const point: PickupPoint = { code, name };
      const address = String(row.address ?? row.location ?? "").trim();
      const city = String(row.city ?? row.city_name ?? "").trim();
      const workTime = String(row.work_time ?? "").trim();
      if (address) point.address = address;
      if (city) point.city = city;
      if (workTime) point.work_time = workTime;
      return point;
    })
    .filter((item): item is PickupPoint => Boolean(item));
}

function buildFioFromProfile(profile: TgUserRecord | null): string {
  if (!profile) return "";
  const parts = [profile.last_name, profile.first_name, profile.middle_name]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.join(" ").trim();
}

export function AddressesPage() {
  const nav = useNavigate();

  const [addresses, setAddresses] = useState<TgAddressPreset[]>([]);
  const [userProfile, setUserProfile] = useState<TgUserRecord | null>(null);
  const [mode, setMode] = useState<"list" | "details">("list");
  const [isEditing, setIsEditing] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<AddressForm>(EMPTY_FORM);

  const [cityValue, setCityValue] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cityOptions, setCityOptions] = useState<SearchCityOption[]>([]);
  const [selectedCityCode, setSelectedCityCode] = useState<string | null>(null);
  const [citySearchDone, setCitySearchDone] = useState(false);

  const [pvzValue, setPvzValue] = useState("");
  const [pvzQuery, setPvzQuery] = useState("");
  const [pvzList, setPvzList] = useState<PickupPoint[]>([]);
  const [selectedPvzCode, setSelectedPvzCode] = useState<string | null>(null);
  const [pvzSearchDone, setPvzSearchDone] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultChangingId, setDefaultChangingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [cdekWarningText, setCdekWarningText] = useState<string | null>(null);

  const resetPvzSelection = () => {
    setPvzValue("");
    setPvzQuery("");
    setPvzList([]);
    setSelectedPvzCode(null);
    setPvzSearchDone(false);
  };

  const resetCityAndPvzSelection = () => {
    setSelectedCityCode(null);
    setCitySearchDone(false);
    resetPvzSelection();
  };

  const clearSearchLists = () => {
    setCityQuery("");
    setCityOptions([]);
    setCitySearchDone(false);
    setPvzQuery("");
    setPvzList([]);
    setPvzSearchDone(false);
  };

  const visiblePvz = useMemo(() => (Array.isArray(pvzList) ? pvzList : []), [pvzList]);
  const currentEditingAddress = useMemo(
    () => addresses.find((row) => row.id === editingAddressId) ?? null,
    [addresses, editingAddressId],
  );

  const reloadAddresses = async (preferredId?: string | null) => {
    const rows = await listAddressPresets();
    setAddresses(rows);
    const selectedStored = readSelectedPresetId();
    const active =
      rows.find((row) => row.id === preferredId) ??
      rows.find((row) => row.id === selectedStored) ??
      rows.find((row) => row.is_default) ??
      rows[0] ??
      null;
    saveSelectedPresetId(active?.id ?? null);
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const [profile] = await Promise.all([
          loadTelegramUserProfile(),
          reloadAddresses(),
        ]);
        setUserProfile(profile);
      } catch (error) {
        console.error("addresses load failed", getErrorDetails(error));
        if (isTgIdentityRequiredError(error)) {
          setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
        } else {
          setErrorText("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р°РґСЂРµСЃР°.");
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!noticeText) return;
    const timer = window.setTimeout(() => setNoticeText(null), 2000);
    return () => window.clearTimeout(timer);
  }, [noticeText]);

  useEffect(() => {
    if (mode !== "details" || !isEditing) return;
    if (cityQuery.trim().length < 2) {
      setCityOptions([]);
      setCitySearchDone(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const raw = await shipping.searchCities(cityQuery.trim());
        const list = normalizeCities(raw);
        setCityOptions(list);
        setCitySearchDone(true);
        setCdekWarningText(null);
      } catch (error) {
        console.error("address city search failed", getErrorDetails(error));
        setCityOptions([]);
        setCitySearchDone(true);
        setCdekWarningText("РџРѕРёСЃРє РіРѕСЂРѕРґРѕРІ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.");
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [mode, isEditing, cityQuery]);

  useEffect(() => {
    if (mode !== "details" || !isEditing) return;
    if (pvzQuery.trim().length < 2) {
      setPvzList([]);
      setPvzSearchDone(false);
      return;
    }
    if (!selectedCityCode) {
      setPvzList([]);
      setPvzSearchDone(false);
      setCdekWarningText("РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ РіРѕСЂРѕРґ.");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const cityParam = selectedCityCode;
        const raw = await shipping.getPickupPoints(cityParam);
        const all = normalizePvz(raw);
        const q = pvzQuery.trim().toLowerCase();
        const filtered = all.filter((point) => `${point.name ?? ""} ${point.address ?? ""}`.toLowerCase().includes(q));
        setPvzList(filtered);
        setPvzSearchDone(true);
        setCdekWarningText(null);
      } catch (error) {
        console.error("address pvz search failed", getErrorDetails(error));
        setPvzList([]);
        setPvzSearchDone(true);
        setCdekWarningText("РџРѕРёСЃРє РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РњРѕР¶РЅРѕ СЃРѕС…СЂР°РЅРёС‚СЊ С‚РµРєСѓС‰РёРµ Р·РЅР°С‡РµРЅРёСЏ Р°РґСЂРµСЃР°.");
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [mode, isEditing, pvzQuery, selectedCityCode, cityValue]);

  const openDetails = (address: TgAddressPreset) => {
    const mapped = mapAddressToForm(address);
    setMode("details");
    setIsEditing(false);
    setEditingAddressId(address.id);
    setSavedForm(mapped);
    setForm(mapped);
    setCityValue(address.city ?? "");
    setCityQuery("");
    setCityOptions([]);
    setSelectedCityCode(address.city_code ?? null);
    setCitySearchDone(false);
    setPvzValue(address.pvz ?? "");
    setPvzQuery("");
    setPvzList([]);
    setSelectedPvzCode(address.pvz_code ?? null);
    setPvzSearchDone(false);
    setErrorText(null);
    setCdekWarningText(null);
  };

  const startCreate = () => {
    const isFirstAddress = addresses.length === 0;
    const prefillFio = isFirstAddress ? buildFioFromProfile(userProfile) : "";
    const prefillPhone = isFirstAddress ? String(userProfile?.phone ?? "").trim() : "";
    const mapped: AddressForm = {
      ...EMPTY_FORM,
      name: `РџСЂРѕС„РёР»СЊ ${addresses.length + 1}`,
      recipientFio: prefillFio,
      recipientPhone: prefillPhone,
    };
    setMode("details");
    setIsEditing(true);
    setEditingAddressId(null);
    setSavedForm(mapped);
    setForm(mapped);
    setCityValue("");
    setCityQuery("");
    setCityOptions([]);
    resetCityAndPvzSelection();
    setErrorText(null);
    setCdekWarningText(null);
  };

  const startEditCurrent = () => {
    setForm(savedForm);
    setCityQuery("");
    setCityOptions([]);
    setSelectedCityCode(currentEditingAddress?.city_code ?? null);
    setCitySearchDone(false);
    setPvzQuery("");
    setPvzList([]);
    setSelectedPvzCode(currentEditingAddress?.pvz_code ?? null);
    setPvzSearchDone(false);
    setErrorText(null);
    setCdekWarningText(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setForm(savedForm);
    if (editingAddressId) {
      const source = addresses.find((row) => row.id === editingAddressId);
      setCityValue(source?.city ?? "");
      setPvzValue(source?.pvz ?? "");
      setIsEditing(false);
    } else {
      setMode("list");
    }
    setCityQuery("");
    setCityOptions([]);
    resetCityAndPvzSelection();
    setErrorText(null);
    setCdekWarningText(null);
  };

  const validateForm = () => {
    if (!form.name.trim()) return "Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ Р°РґСЂРµСЃР°.";
    if (!form.recipientFio.trim()) return "Р’РІРµРґРёС‚Рµ Р¤РРћ.";
    if (!form.recipientPhone.trim()) return "Р’РІРµРґРёС‚Рµ С‚РµР»РµС„РѕРЅ.";
    if (!/^\+7\(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(form.recipientPhone)) {
      return "РўРµР»РµС„РѕРЅ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ +7(XXX) XXX-XX-XX.";
    }
    if (!cityValue.trim()) return "Р’С‹Р±РµСЂРёС‚Рµ РіРѕСЂРѕРґ.";
    if (!pvzValue.trim()) return "Р’С‹Р±РµСЂРёС‚Рµ РџР’Р—.";
    if (!selectedCityCode) return "Р’С‹Р±РµСЂРёС‚Рµ РіРѕСЂРѕРґ РёР· РїРѕРёСЃРєР° РЎР”Р­Рљ.";
    if (!selectedPvzCode) return "Р’С‹Р±РµСЂРёС‚Рµ РџР’Р— РёР· РїРѕРёСЃРєР° РЎР”Р­Рљ.";
    return null;
  };

  const onSaveAddress = async () => {
    const validationError = validateForm();
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setIsSaving(true);
    setErrorText(null);
    try {
      const savedId = await upsertAddressPreset({
        preset_id: editingAddressId,
        name: form.name.trim(),
        recipient_fio: form.recipientFio.trim(),
        recipient_phone: form.recipientPhone.trim(),
        city: cityValue.trim(),
        city_code: selectedCityCode,
        pvz: pvzValue.trim(),
        pvz_code: selectedPvzCode,
        is_default: form.isDefault,
      });
      await reloadAddresses(savedId);
      const savedRows = await listAddressPresets();
      const savedAddress = savedRows.find((row) => row.id === savedId) ?? null;
      if (savedAddress) {
        const mapped = mapAddressToForm(savedAddress);
        setSavedForm(mapped);
        setForm(mapped);
        setCityValue(savedAddress.city ?? "");
        setSelectedCityCode(savedAddress.city_code ?? null);
        setPvzValue(savedAddress.pvz ?? "");
        setSelectedPvzCode(savedAddress.pvz_code ?? null);
      }
      clearSearchLists();
      setEditingAddressId(savedId);
      setMode("details");
      setIsEditing(false);
      setNoticeText("РђРґСЂРµСЃ СЃРѕС…СЂР°РЅС‘РЅ.");
    } catch (error) {
      console.error("address save failed", getErrorDetails(error));
      const message = error instanceof Error ? error.message : "";
      if (isTgIdentityRequiredError(error)) {
        setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
      } else if (message.includes("CITY_CODE_REQUIRED")) {
        setErrorText("Р’С‹Р±РµСЂРёС‚Рµ РіРѕСЂРѕРґ РёР· СЃРїСЂР°РІРѕС‡РЅРёРєР° РЎР”Р­Рљ.");
      } else if (message.includes("PVZ_CODE_REQUIRED")) {
        setErrorText("Р’С‹Р±РµСЂРёС‚Рµ РїСѓРЅРєС‚ РІС‹РґР°С‡Рё РёР· СЃРїСЂР°РІРѕС‡РЅРёРєР° РЎР”Р­Рљ.");
      } else {
        setErrorText("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Р°РґСЂРµСЃ.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onSetDefault = async (address: TgAddressPreset) => {
    if (address.is_default) return;
    setDefaultChangingId(address.id);
    setErrorText(null);
    try {
      await upsertAddressPreset({
        preset_id: address.id,
        name: address.name,
        recipient_fio: address.recipient_fio,
        recipient_phone: address.recipient_phone,
          city: address.city,
          city_code: address.city_code ?? null,
          pvz: address.pvz,
          pvz_code: address.pvz_code ?? null,
          is_default: true,
        });
      await reloadAddresses(address.id);
    } catch (error) {
      console.error("set default address failed", getErrorDetails(error));
      setErrorText("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРґРµР»Р°С‚СЊ Р°РґСЂРµСЃ РѕСЃРЅРѕРІРЅС‹Рј.");
    } finally {
      setDefaultChangingId(null);
    }
  };

  const onDelete = async (address: TgAddressPreset) => {
    const confirmed = window.confirm("РЈРґР°Р»РёС‚СЊ Р°РґСЂРµСЃ? Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.");
    if (!confirmed) return;

    setDeleteLoadingId(address.id);
    setErrorText(null);
    try {
      await deleteAddressPreset(address.id);
      const rows = await listAddressPresets();
      if (address.is_default && rows.length > 0 && !rows.some((row) => row.is_default)) {
        const first = rows[0];
        await upsertAddressPreset({
          preset_id: first.id,
          name: first.name,
          recipient_fio: first.recipient_fio,
          recipient_phone: first.recipient_phone,
          city: first.city,
          city_code: first.city_code ?? null,
          pvz: first.pvz,
          pvz_code: first.pvz_code ?? null,
          is_default: true,
        });
        await reloadAddresses(first.id);
      } else {
        setAddresses(rows);
        const active = rows.find((row) => row.is_default) ?? rows[0] ?? null;
        saveSelectedPresetId(active?.id ?? null);
      }
      setNoticeText("РђРґСЂРµСЃ СѓРґР°Р»С‘РЅ.");
      if (mode === "details" && editingAddressId === address.id) {
        setMode("list");
        setIsEditing(false);
        setEditingAddressId(null);
      }
    } catch (error) {
      console.error("address delete failed", getErrorDetails(error));
      setErrorText("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р°РґСЂРµСЃ.");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  if (mode === "details") {
    if (!isEditing) {
      return (
        <Page title="РђРґСЂРµСЃ">
          <Card className="ui-card--padded address-section">
            <div className="address-section__title">Р”Р°РЅРЅС‹Рµ Р°РґСЂРµСЃР°</div>
            <div className="address-view-grid">
              <div className="address-view-row">
                <span className="address-view-row__label">РќР°Р·РІР°РЅРёРµ Р°РґСЂРµСЃР°</span>
                <span className="address-view-row__value" title={form.name}>{form.name || "вЂ”"}</span>
              </div>
              <div className="address-view-row">
                <span className="address-view-row__label">РџРѕР»СѓС‡Р°С‚РµР»СЊ</span>
                <span className="address-view-row__value" title={form.recipientFio}>{form.recipientFio || "вЂ”"}</span>
              </div>
              <div className="address-view-row">
                <span className="address-view-row__label">РўРµР»РµС„РѕРЅ</span>
                <span className="address-view-row__value">{form.recipientPhone || "вЂ”"}</span>
              </div>
              <div className="address-view-row">
                <span className="address-view-row__label">Р“РѕСЂРѕРґ</span>
                <span className="address-view-row__value">{cityValue || "вЂ”"}</span>
              </div>
              <div className="address-view-row">
                <span className="address-view-row__label">РџР’Р—</span>
                <span className="address-view-row__value address-view-row__value--ellipsis" title={pvzValue || "РџР’Р— РЅРµ РІС‹Р±СЂР°РЅ"}>
                  {pvzValue || "РџР’Р— РЅРµ РІС‹Р±СЂР°РЅ"}
                </span>
              </div>
              <div className="address-view-row">
                <span className="address-view-row__label">РћСЃРЅРѕРІРЅРѕР№</span>
                <span className={`address-view-badge ${form.isDefault ? "is-on" : ""}`}>{form.isDefault ? "Р”Р°" : "РќРµС‚"}</span>
              </div>
            </div>
          </Card>

          <div className="address-actions">
            <Button onClick={startEditCurrent}>РР·РјРµРЅРёС‚СЊ</Button>
            <Button variant="secondary" onClick={() => setMode("list")}>РќР°Р·Р°Рґ</Button>
          </div>

          {errorText ? <div className="address-error">{errorText}</div> : null}
          {noticeText ? <div className="address-notice">{noticeText}</div> : null}
        </Page>
      );
    }

    return (
      <Page title="РђРґСЂРµСЃ">
        <Card className="ui-card--padded address-section">
          <div className="address-section__title">РџР°СЂР°РјРµС‚СЂС‹ Р°РґСЂРµСЃР°</div>
          <Input
            placeholder="РќР°Р·РІР°РЅРёРµ Р°РґСЂРµСЃР°"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <FioInput
            placeholder="Р’РІРµРґРёС‚Рµ Р¤РРћ"
            value={form.recipientFio}
            onChange={(value) => setForm((prev) => ({ ...prev, recipientFio: value }))}
          />
          <PhoneInput
            placeholder="+7(XXX) XXX-XX-XX"
            value={form.recipientPhone}
            onChange={(value) => setForm((prev) => ({ ...prev, recipientPhone: value }))}
          />
          <label className="address-checkbox">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
            />
            <span>РЎРґРµР»Р°С‚СЊ РѕСЃРЅРѕРІРЅС‹Рј</span>
          </label>
        </Card>

        <Card className="ui-card--padded address-section">
          <div className="address-section__title">Р“РѕСЂРѕРґ</div>
          <Input
            placeholder="РџРѕРёСЃРє РіРѕСЂРѕРґР°..."
            value={cityQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              setCityQuery(nextValue);
              if (nextValue.trim()) {
                setCityValue("");
                setCityOptions([]);
                resetCityAndPvzSelection();
              }
            }}
          />
          <div className="address-selected-pvz" title={cityValue || "Р“РѕСЂРѕРґ РЅРµ РІС‹Р±СЂР°РЅ"}>
            {cityValue || "Р“РѕСЂРѕРґ РЅРµ РІС‹Р±СЂР°РЅ"}
          </div>
          {(Array.isArray(cityOptions) ? cityOptions : []).length ? (
            <div className="address-list">
              {(Array.isArray(cityOptions) ? cityOptions : []).map((city, idx) => (
                <ListItem
                  key={`${city.code ?? "none"}-${city.label}-${idx}`}
                  title={city.label}
                  subtitle={city.region}
                  onClick={() => {
                    setSelectedCityCode(city.code);
                    setCityValue(city.label);
                    setCityQuery("");
                    setCityOptions([]);
                    setCitySearchDone(false);
                    resetPvzSelection();
                  }}
                  right={cityValue === city.label ? <span className="address-badge">Р’С‹Р±СЂР°РЅ</span> : null}
                  chevron={false}
                  divider={idx !== cityOptions.length - 1}
                  position={idx === 0 ? "first" : idx === cityOptions.length - 1 ? "last" : "middle"}
                />
              ))}
            </div>
          ) : null}
          {citySearchDone && cityQuery.trim().length >= 2 && cityOptions.length === 0 ? (
            <div className="address-muted">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</div>
          ) : null}
        </Card>

        <Card className="ui-card--padded address-section">
          <div className="address-section__title">РџСѓРЅРєС‚ РІС‹РґР°С‡Рё РЎР”Р­Рљ</div>
          <Input
            placeholder="РџРѕРёСЃРє РџР’Р—..."
            value={pvzQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              setPvzQuery(nextValue);
              if (nextValue.trim()) {
                setPvzValue("");
                setPvzList([]);
                setSelectedPvzCode(null);
                setPvzSearchDone(false);
              }
            }}
          />
          <div className="address-selected-pvz" title={pvzValue || "РџР’Р— РЅРµ РІС‹Р±СЂР°РЅ"}>
            {pvzValue || "РџР’Р— РЅРµ РІС‹Р±СЂР°РЅ"}
          </div>
          {(Array.isArray(visiblePvz) ? visiblePvz : []).length ? (
            <div className="address-list">
              {(Array.isArray(visiblePvz) ? visiblePvz : []).map((point, idx) => {
                const label = [point.name, point.address].filter(Boolean).join(", ");
                const isSelected = selectedPvzCode === point.code;
                return (
                  <ListItem
                    key={point.code}
                    title={point.name}
                    subtitle={point.address}
                    onClick={() => {
                      setSelectedPvzCode(point.code);
                      setPvzValue(label);
                      setNoticeText("РџСѓРЅРєС‚ РІС‹РґР°С‡Рё РІС‹Р±СЂР°РЅ.");
                    }}
                    right={isSelected ? <span className="address-badge">Р’С‹Р±СЂР°РЅ</span> : null}
                    chevron={false}
                    divider={idx !== visiblePvz.length - 1}
                    position={idx === 0 ? "first" : idx === visiblePvz.length - 1 ? "last" : "middle"}
                  />
                );
              })}
            </div>
          ) : null}
          {pvzSearchDone && pvzQuery.trim().length >= 2 && visiblePvz.length === 0 ? (
            <div className="address-muted">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</div>
          ) : null}
        </Card>

        <div className="address-actions">
          <Button onClick={() => void onSaveAddress()} disabled={isSaving}>
            {isSaving ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
          </Button>
          <Button variant="secondary" onClick={cancelEdit}>РћС‚РјРµРЅР°</Button>
        </div>

        {errorText ? <div className="address-error">{errorText}</div> : null}
        {cdekWarningText ? <div className="address-warning">{cdekWarningText}</div> : null}
      </Page>
    );
  }

  return (
    <Page title="РђРґСЂРµСЃР°">
      {isLoading ? <div className="address-muted">Р—Р°РіСЂСѓР·РєР°...</div> : null}

      {!isLoading && addresses.length === 0 ? (
        <Button onClick={startCreate}>Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ</Button>
      ) : null}

      {addresses.length ? (
        <div className="address-cards">
          {addresses.map((address) => {
            const subtitle = formatAddressSubtitle(address);
            return (
              <Card key={address.id} className="ui-card--padded address-card">
                <button
                  type="button"
                  className="address-card__body"
                  onClick={() => openDetails(address)}
                >
                  <div className="address-card__titleRow">
                    <div className="address-card__title">{address.name}</div>
                    <div className="address-card__arrow">{">"}</div>
                  </div>
                  <div className="address-card__subtitle" title={subtitle}>
                    {subtitle}
                  </div>
                  {address.is_default ? <div className="address-card__default">РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ</div> : null}
                </button>

                <div className="address-card__actions">
                  <button
                    type="button"
                    className={`address-icon-btn ${address.is_default ? "is-active" : ""}`}
                    onClick={() => void onSetDefault(address)}
                    disabled={Boolean(defaultChangingId || deleteLoadingId)}
                    aria-label="РЎРґРµР»Р°С‚СЊ РѕСЃРЅРѕРІРЅС‹Рј"
                  >
                    в…
                  </button>
                  <button
                    type="button"
                    className="address-icon-btn"
                    onClick={() => void onDelete(address)}
                    disabled={Boolean(defaultChangingId || deleteLoadingId)}
                    aria-label="РЈРґР°Р»РёС‚СЊ Р°РґСЂРµСЃ"
                  >
                    рџ—‘
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {addresses.length ? <Button onClick={startCreate}>Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ</Button> : null}
      <Button variant="secondary" onClick={() => nav(-1)}>РќР°Р·Р°Рґ</Button>

      {noticeText ? <div className="address-notice">{noticeText}</div> : null}
      {errorText ? <div className="address-error">{errorText}</div> : null}
      {cdekWarningText ? <div className="address-warning">{cdekWarningText}</div> : null}
    </Page>
  );
}

export default AddressesPage;

