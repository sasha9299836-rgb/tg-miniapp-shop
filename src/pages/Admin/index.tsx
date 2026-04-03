import { useNavigate } from "react-router-dom";
import { Page } from "../../shared/ui/Page";
import { Button } from "../../shared/ui/Button";
import { useAdminStore } from "../../entities/account/model/useAdminStore";

export function AdminHome() {
  const nav = useNavigate();
  const { clearAdmin } = useAdminStore();

  const onLogout = () => {
    clearAdmin();
    nav("/account");
  };

  return (
    <Page title="Админка" subtitle="Продажи, заказы и операционная сводка">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => nav("/admin/posts/new")}>Новый пост</Button>
        <Button variant="secondary" onClick={() => nav("/admin/posts/scheduled")}>Черновики и отложенные</Button>
        <Button variant="secondary" onClick={() => nav("/admin/orders")}>Заказы</Button>
        <Button variant="secondary" onClick={onLogout}>Выйти из админки</Button>
      </div>
    </Page>
  );
}

export default AdminHome;
