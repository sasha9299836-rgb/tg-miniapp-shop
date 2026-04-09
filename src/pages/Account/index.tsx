import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore } from "../../entities/account/model/useAccountStore";
import { useAdminStore } from "../../entities/account/model/useAdminStore";
import { canUseAdminSessionByContext, getAdminAccessDebugState } from "../../shared/auth/adminAccess";
import { Card, CardText, CardTitle } from "../../shared/ui/Card";
import { ListItem } from "../../shared/ui/ListItem";
import { Page } from "../../shared/ui/Page";
import { useThemeStore } from "../../shared/theme/useThemeStore";
import "./styles.css";

export function AccountPage() {
  const nav = useNavigate();
  const isDbAdmin = useAccountStore((s) => s.profile.isAdmin);
  const { mode, setMode } = useThemeStore();
  const { load, clearAdmin } = useAdminStore();
  const canUseAdminAccess = canUseAdminSessionByContext(isDbAdmin);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    console.log("[admin-access][AccountPage]", getAdminAccessDebugState(isDbAdmin));
  }, [isDbAdmin, canUseAdminAccess]);

  useEffect(() => {
    if (!canUseAdminAccess) {
      clearAdmin();
    }
  }, [canUseAdminAccess, clearAdmin]);

  return (
    <Page>
      <div className="account-grid">
        <Card className="ui-card--padded account-card">
          <CardTitle>Аккаунт</CardTitle>
          <CardText>Профиль, лояльность, адреса и заказы.</CardText>

          <div className="theme-toggle">
            <button
              type="button"
              className={`theme-toggle__btn ${mode === "light" ? "is-active" : ""}`}
              onClick={() => setMode("light")}
              aria-pressed={mode === "light"}
            >
              Светлая
            </button>
            <button
              type="button"
              className={`theme-toggle__btn ${mode === "dark" ? "is-active" : ""}`}
              onClick={() => setMode("dark")}
              aria-pressed={mode === "dark"}
            >
              Тёмная
            </button>
          </div>
        </Card>

        <div className="account-list">
          {canUseAdminAccess ? (
            <ListItem
              title="Админка"
              subtitle="Управление данными"
              onClick={() => nav("/admin")}
              position="single"
              divider={false}
              chevron={false}
            />
          ) : null}
          <ListItem
            title="Личные данные"
            subtitle="Имя, Telegram, email"
            onClick={() => nav("/account/profile")}
            position="single"
            divider={false}
            chevron={false}
          />
          <ListItem
            title="Программа лояльности"
            subtitle="Уровни и скидки"
            onClick={() => nav("/account/loyalty")}
            position="single"
            divider={false}
            chevron={false}
          />
          <ListItem
            title="Адреса"
            subtitle="ПВЗ или доставка до двери"
            onClick={() => nav("/account/addresses")}
            position="single"
            divider={false}
            chevron={false}
          />
          <ListItem
            title="Заказы"
            subtitle="Активные заказы"
            onClick={() => nav("/account/orders")}
            position="single"
            divider={false}
            chevron={false}
          />
          <ListItem
            title="Политика конфиденциальности"
            subtitle="Как мы обрабатываем персональные данные"
            onClick={() => nav("/account/privacy")}
            position="single"
            divider={false}
            chevron={false}
          />
          <ListItem
            title="Публичная оферта"
            subtitle="Условия покупки и доставки"
            onClick={() => nav("/account/offer")}
            position="single"
            divider={false}
            chevron={false}
          />
        </div>
      </div>
    </Page>
  );
}

export default AccountPage;
