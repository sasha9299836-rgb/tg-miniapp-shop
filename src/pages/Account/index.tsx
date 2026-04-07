import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountStore } from "../../entities/account/model/useAccountStore";
import { useAdminStore } from "../../entities/account/model/useAdminStore";
import { adminLogin } from "../../shared/api/adminApi";
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
  const { load, setSessionToken, clearAdmin } = useAdminStore();
  const canUseAdminAccess = canUseAdminSessionByContext(isDbAdmin);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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

  const onLogin = async () => {
    if (isSubmitting || !canUseAdminAccess) return;

    setIsSubmitting(true);
    setLoginError(null);
    try {
      const { session_token } = await adminLogin(code.trim());
      setSessionToken(session_token);
      nav("/admin");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "INVALID_CODE") {
        setLoginError("Неверный код");
      } else {
        setLoginError("Ошибка входа");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Page>
      <div className="account-grid">
        <Card className="ui-card--padded account-card">
          <CardTitle>Аккаунт</CardTitle>
          <CardText>Профиль, лояльность, адреса и заказы.</CardText>

          {canUseAdminAccess ? (
            <div style={{ marginTop: 10 }}>
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Код доступа"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  font: "inherit",
                }}
              />
              <button
                type="button"
                onClick={() => void onLogin()}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "#f1f2f4",
                  font: "inherit",
                }}
                disabled={!code.trim() || isSubmitting}
              >
                {isSubmitting ? "Проверка..." : "Войти в админку"}
              </button>
              {loginError ? (
                <div style={{ marginTop: 8, color: "#b42318", fontSize: 13 }}>
                  {loginError}
                </div>
              ) : null}
            </div>
          ) : null}

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
        </div>
      </div>
    </Page>
  );
}

export default AccountPage;
