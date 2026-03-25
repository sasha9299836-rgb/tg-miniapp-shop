import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { Page } from "../../../shared/ui/Page";
import { useAccountStore } from "../../../entities/account/model/useAccountStore";

export function ProfilePage() {
  const nav = useNavigate();
  const { profile, setProfile } = useAccountStore();

  return (
    <Page title="Личные данные">
      <div style={{ display: "grid", gap: 12 }}>
        <div className="glass" style={{ padding: 14 }}>
          <div className="h1">Профиль пользователя</div>
          <div className="p">Заполните данные для заказа и доставки.</div>
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
            placeholder="Ник Telegram"
            value={profile.telegramUsername}
            onChange={(e) => setProfile({ telegramUsername: e.target.value })}
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
