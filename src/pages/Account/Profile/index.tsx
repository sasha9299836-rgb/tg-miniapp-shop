import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { Page } from "../../../shared/ui/Page";
import { useAccountStore } from "../../../entities/account/model/useAccountStore";
import { useTelegramUser } from "../../../shared/auth/useTelegramUser";

const PROFILE_REGISTERED_AT_KEY = "tg_profile_registered_at";

function formatRegistrationDate(value: number): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProfilePage() {
  const nav = useNavigate();
  const { profile, setProfile } = useAccountStore();
  const tgUser = useTelegramUser();

  const [registeredAt] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_REGISTERED_AT_KEY) ?? "";
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    } catch {
      // no-op
    }

    const now = Date.now();
    try {
      window.localStorage.setItem(PROFILE_REGISTERED_AT_KEY, String(now));
    } catch {
      // no-op
    }
    return now;
  });

  const accountHandle = useMemo(() => {
    if (tgUser?.username) return `@${tgUser.username}`;
    if (tgUser?.firstName) return tgUser.firstName;
    return profile.firstName || "Пользователь";
  }, [profile.firstName, tgUser?.firstName, tgUser?.username]);

  const telegramUsernameView = useMemo(
    () => (tgUser?.username ? `@${tgUser.username}` : "Не указан в Telegram"),
    [tgUser?.username],
  );

  useEffect(() => {
    if (tgUser?.firstName && !profile.firstName.trim()) {
      setProfile({ firstName: tgUser.firstName });
    }
  }, [profile.firstName, setProfile, tgUser?.firstName]);

  return (
    <Page title="Личные данные">
      <div style={{ display: "grid", gap: 12 }}>
        <div className="glass" style={{ padding: 14 }}>
          <div className="h1">Профиль пользователя</div>
          <div className="p">Заполните данные для заказа и доставки.</div>
          <div style={{ marginTop: 6, fontSize: 15, color: "var(--text)", fontWeight: 600 }}>{accountHandle}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>
            Зарегистрирован: {formatRegistrationDate(registeredAt)}
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
            placeholder="Дата рождения (YYYY-MM-DD)"
            value={profile.birthDate}
            onChange={(e) => setProfile({ birthDate: e.target.value })}
          />
          <Input
            placeholder="Telegram username"
            value={telegramUsernameView}
            readOnly
          />
          <Input
            placeholder="Email"
            value={profile.email}
            onChange={(e) => setProfile({ email: e.target.value })}
          />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <Button onClick={() => nav(-1)}>Сохранить</Button>
          <Button variant="secondary" onClick={() => nav(-1)}>
            Назад
          </Button>
        </div>
      </div>
    </Page>
  );
}

export default ProfilePage;
