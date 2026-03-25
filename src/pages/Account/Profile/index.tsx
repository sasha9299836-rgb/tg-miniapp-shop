import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore } from "../../../entities/account/model/useAccountStore";
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

export function ProfilePage() {
  const nav = useNavigate();
  const { profile, setProfile } = useAccountStore();
  const tgUser = useTelegramUser();

  const telegramUsernameView = useMemo(
    () => (tgUser?.username ? `@${tgUser.username}` : profile.telegramUsername || "Не указан в Telegram"),
    [profile.telegramUsername, tgUser?.username],
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
            placeholder="Дата рождения (YYYY-MM-DD)"
            value={profile.birthDate}
            onChange={(e) => setProfile({ birthDate: e.target.value })}
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
