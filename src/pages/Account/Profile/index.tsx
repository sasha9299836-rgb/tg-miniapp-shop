import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore } from "../../../entities/account/model/useAccountStore";
import { getTelegramUser } from "../../../app/providers/telegram";
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
  const { profile, setProfile, telegramDebug } = useAccountStore();
  const tgUser = useTelegramUser();

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug_tg") === "1";
  }, []);

  const accountHandle = useMemo(() => {
    if (tgUser?.username) return `@${tgUser.username}`;
    if (tgUser?.firstName) return tgUser.firstName;
    return profile.firstName || "Пользователь";
  }, [profile.firstName, tgUser?.firstName, tgUser?.username]);

  const telegramUsernameView = useMemo(
    () => (tgUser?.username ? `@${tgUser.username}` : profile.telegramUsername || "Не указан в Telegram"),
    [profile.telegramUsername, tgUser?.username],
  );

  const telegramIdView = useMemo(
    () => String(tgUser?.id ?? profile.telegramId ?? "").trim() || "Не указан в Telegram",
    [profile.telegramId, tgUser?.id],
  );

  useEffect(() => {
    if (tgUser?.firstName && !profile.firstName.trim()) {
      setProfile({ firstName: tgUser.firstName });
    }
  }, [profile.firstName, setProfile, tgUser?.firstName]);

  const rawUser = useMemo(
    () => window.Telegram?.WebApp?.initDataUnsafe?.user ?? null,
    [tgUser?.id, tgUser?.username, tgUser?.firstName, tgUser?.lastName],
  );

  const parsedTelegramUser = useMemo(
    () => getTelegramUser(),
    [tgUser?.id, tgUser?.username, tgUser?.firstName, tgUser?.lastName],
  );

  return (
    <Page title="Личные данные">
      <div style={{ display: "grid", gap: 12 }}>
        <div className="glass" style={{ padding: 14 }}>
          <div className="h1">Профиль пользователя</div>
          <div className="p">Заполните данные для заказа и доставки.</div>
          <div style={{ marginTop: 6, fontSize: 15, color: "var(--text)", fontWeight: 600 }}>{accountHandle}</div>
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
            placeholder="Telegram username"
            value={telegramUsernameView}
            readOnly
          />
          <Input
            placeholder="Telegram ID"
            value={telegramIdView}
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
      {debugEnabled ? (
        <div
          style={{
            position: "fixed",
            left: 8,
            right: 8,
            bottom: 8,
            maxHeight: "42vh",
            overflow: "auto",
            background: "rgba(0, 0, 0, 0.85)",
            color: "#d7ffe8",
            borderRadius: 10,
            padding: 10,
            zIndex: 9999,
            fontSize: 11,
            lineHeight: 1.35,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(
            {
              hasTelegram: Boolean(window.Telegram),
              hasWebApp: Boolean(window.Telegram?.WebApp),
              rawUser,
              rawUserId: rawUser?.id ?? null,
              rawUserIdType: typeof rawUser?.id,
              parsedTelegramUser,
              storeTelegramId: profile.telegramId,
              storeTelegramUsername: profile.telegramUsername,
              storeRegisteredAt: profile.registeredAt,
              bootstrapStatus: telegramDebug.status,
              upsertError: telegramDebug.upsertError,
            },
            null,
            2,
          )}
        </div>
      ) : null}
    </Page>
  );
}

export default ProfilePage;
