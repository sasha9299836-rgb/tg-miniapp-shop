import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore, type Profile } from "../../../entities/account/model/useAccountStore";
import { useAdminStore } from "../../../entities/account/model/useAdminStore";
import {
  loadTelegramUserProfile,
  saveTelegramUserProfile,
  type TgUserRecord,
} from "../../../shared/api/telegramUsersApi";
import { listAddressPresets } from "../../../shared/api/addressPresetsApi";
import { useTelegramUser } from "../../../shared/auth/useTelegramUser";
import { normalizeFio } from "../../../shared/lib/formatFio";
import { extractNationalDigits } from "../../../shared/lib/formatPhone";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { Page } from "../../../shared/ui/Page";
import { PhoneInput } from "../../../shared/ui/inputs/PhoneInput";

function formatRegistrationDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function applyProfileFromDbRow(setProfile: (patch: Partial<Profile>) => void, row: TgUserRecord) {
  setProfile({
    lastName: row.last_name ?? "",
    firstName: row.first_name ?? "",
    middleName: row.middle_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    telegramUsername: row.telegram_username ? `@${row.telegram_username}` : "",
    isAdmin: Boolean(row.is_admin),
    registeredAt: row.registered_at ?? null,
  });
}

function splitFio(value: string): { lastName: string; firstName: string; middleName: string } {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    lastName: parts[0] ?? "",
    firstName: parts[1] ?? "",
    middleName: parts.slice(2).join(" "),
  };
}

export function ProfilePage() {
  const nav = useNavigate();
  const { profile, setProfile } = useAccountStore();
  const setDbAdmin = useAdminStore((s) => s.setDbAdmin);
  const tgUser = useTelegramUser();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const telegramUsernameView = useMemo(
    () => (tgUser?.username ? `@${tgUser.username}` : profile.telegramUsername || "Не указан в Telegram"),
    [profile.telegramUsername, tgUser?.username],
  );

  useEffect(() => {
    let active = true;
    setIsLoadingProfile(true);
    void loadTelegramUserProfile()
      .then(async (row) => {
        if (!active) return;
        if (row) {
          setDbAdmin(Boolean(row.is_admin));
          applyProfileFromDbRow(setProfile, row);

          const isProfileEmpty = !String(row.last_name ?? "").trim() &&
            !String(row.first_name ?? "").trim() &&
            !String(row.middle_name ?? "").trim() &&
            !String(row.phone ?? "").trim();

          if (isProfileEmpty) {
            try {
              const presets = await listAddressPresets();
              if (!active || !presets.length) return;
              const source = presets.find((preset) => preset.is_default) ?? presets[0];
              const parsed = splitFio(source.recipient_fio);
              setProfile({
                lastName: parsed.lastName,
                firstName: parsed.firstName,
                middleName: parsed.middleName,
                phone: String(source.recipient_phone ?? "").trim(),
              });
            } catch (error) {
              console.log("[tg-user-profile-prefill-from-address] error", error);
            }
          }
          return;
        }

        try {
          const presets = await listAddressPresets();
          if (!active || !presets.length) return;
          const source = presets.find((preset) => preset.is_default) ?? presets[0];
          const parsed = splitFio(source.recipient_fio);
          setProfile({
            lastName: parsed.lastName,
            firstName: parsed.firstName,
            middleName: parsed.middleName,
            phone: String(source.recipient_phone ?? "").trim(),
          });
        } catch (error) {
          console.log("[tg-user-profile-prefill-from-address] error", error);
        }
      })
      .catch((error) => {
        console.log("[tg-user-profile-load] page error", error);
      })
      .finally(() => {
        if (active) setIsLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [setDbAdmin, setProfile]);

  const handleSave = async () => {
    setFormError(null);

    const email = profile.email.trim();
    if (email && !email.includes("@")) {
      setFormError("Проверьте формат email");
      return;
    }

    const phoneDigits = extractNationalDigits(profile.phone);
    if (profile.phone.trim() && phoneDigits.length !== 10) {
      setFormError("Проверьте формат телефона");
      return;
    }

    setIsSaving(true);
    try {
      const row = await saveTelegramUserProfile({
        lastName: profile.lastName,
        firstName: profile.firstName,
        middleName: profile.middleName,
        phone: profile.phone,
        email: profile.email,
      });
      setDbAdmin(Boolean(row.is_admin));
      applyProfileFromDbRow(setProfile, row);
      nav(-1);
    } catch (error) {
      console.log("[tg-user-profile-save] page error", error);
      setFormError("Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page title="Личные данные">
      <div style={{ display: "grid", gap: 12 }}>
        <div className="glass" style={{ padding: 14 }}>
          <div className="h1">Профиль пользователя</div>
          <div className="p">Заполните данные для заказа и доставки.</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>
            Зарегистрирован: {formatRegistrationDate(profile.registeredAt)}
          </div>
        </div>

        <div className="glass" style={{ padding: 14, display: "grid", gap: 10 }}>
          <Input
            placeholder="Фамилия"
            value={profile.lastName}
            onChange={(e) => setProfile({ lastName: e.target.value })}
            autoCapitalize="words"
            autoCorrect="on"
            spellCheck
            onBlur={(e) => setProfile({ lastName: normalizeFio(e.target.value) })}
          />
          <Input
            placeholder="Имя"
            value={profile.firstName}
            onChange={(e) => setProfile({ firstName: e.target.value })}
            autoCapitalize="words"
            autoCorrect="on"
            spellCheck
            onBlur={(e) => setProfile({ firstName: normalizeFio(e.target.value) })}
          />
          <Input
            placeholder="Отчество"
            value={profile.middleName}
            onChange={(e) => setProfile({ middleName: e.target.value })}
            autoCapitalize="words"
            autoCorrect="on"
            spellCheck
            onBlur={(e) => setProfile({ middleName: normalizeFio(e.target.value) })}
          />
          <PhoneInput
            placeholder="Телефон"
            value={profile.phone}
            onChange={(value) => setProfile({ phone: value })}
          />
          <Input
            placeholder="Email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={profile.email}
            onChange={(e) => setProfile({ email: e.target.value })}
            onBlur={(e) => setProfile({ email: e.target.value.trim() })}
          />
          <Input
            placeholder="Telegram username"
            value={telegramUsernameView}
            readOnly
          />
        </div>

        {formError ? <div style={{ color: "#b00020", fontSize: 13 }}>{formError}</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          <Button onClick={() => void handleSave()} disabled={isSaving || isLoadingProfile}>
            {isSaving ? "Сохранение..." : "Сохранить"}
          </Button>
          <Button variant="secondary" onClick={() => nav(-1)} disabled={isSaving}>
            Назад
          </Button>
        </div>
      </div>
    </Page>
  );
}

export default ProfilePage;
