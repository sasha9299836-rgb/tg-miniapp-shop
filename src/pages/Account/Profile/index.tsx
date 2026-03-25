import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore, type Profile } from "../../../entities/account/model/useAccountStore";
import {
  loadTelegramUserProfile,
  saveTelegramUserProfile,
  type TgUserRecord,
} from "../../../shared/api/telegramUsersApi";
import { useTelegramUser } from "../../../shared/auth/useTelegramUser";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { Page } from "../../../shared/ui/Page";

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
    birthDate: row.birth_date ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    telegramUsername: row.telegram_username ? `@${row.telegram_username}` : "",
    registeredAt: row.registered_at ?? null,
  });
}

export function ProfilePage() {
  const nav = useNavigate();
  const { profile, setProfile } = useAccountStore();
  const tgUser = useTelegramUser();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const telegramUsernameView = useMemo(
    () => (tgUser?.username ? `@${tgUser.username}` : profile.telegramUsername || "Не указан в Telegram"),
    [profile.telegramUsername, tgUser?.username],
  );

  const telegramId = useMemo(() => {
    if (tgUser?.id && Number.isInteger(tgUser.id) && tgUser.id > 0) return tgUser.id;
    const parsed = Number.parseInt(profile.telegramId, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [profile.telegramId, tgUser?.id]);

  useEffect(() => {
    if (!telegramId) return;
    let active = true;
    setIsLoadingProfile(true);
    void loadTelegramUserProfile(telegramId)
      .then((row) => {
        if (!active || !row) return;
        applyProfileFromDbRow(setProfile, row);
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
  }, [setProfile, telegramId]);

  const handleSave = async () => {
    if (!telegramId) {
      console.log("[tg-user-profile-save] skip: telegram_id is missing");
      return;
    }

    setIsSaving(true);
    try {
      const row = await saveTelegramUserProfile({
        telegramId,
        lastName: profile.lastName,
        firstName: profile.firstName,
        middleName: profile.middleName,
        birthDate: profile.birthDate,
        phone: profile.phone,
        email: profile.email,
      });
      applyProfileFromDbRow(setProfile, row);
      nav(-1);
    } catch (error) {
      console.log("[tg-user-profile-save] page error", error);
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
          />
          <Input
            placeholder="Имя"
            value={profile.firstName}
            onChange={(e) => setProfile({ firstName: e.target.value })}
          />
          <Input
            placeholder="Отчество"
            value={profile.middleName}
            onChange={(e) => setProfile({ middleName: e.target.value })}
          />
          <Input
            placeholder="Дата рождения (YYYY-MM-DD)"
            value={profile.birthDate}
            onChange={(e) => setProfile({ birthDate: e.target.value })}
          />
          <Input
            placeholder="Телефон"
            value={profile.phone}
            onChange={(e) => setProfile({ phone: e.target.value })}
          />
          <Input
            placeholder="Email"
            value={profile.email}
            onChange={(e) => setProfile({ email: e.target.value })}
          />
          <Input
            placeholder="Telegram username"
            value={telegramUsernameView}
            readOnly
          />
        </div>

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
