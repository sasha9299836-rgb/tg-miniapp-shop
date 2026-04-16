import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../shared/ui/Page";
import { Button } from "../../shared/ui/Button";
import { listPostsByStatus } from "../../shared/api/adminPostsApi";
import { listOrdersByStatuses } from "../../shared/api/ordersApi";
import "./styles.css";

export function AdminHome() {
  const nav = useNavigate();
  const [isPostsMenuOpen, setIsPostsMenuOpen] = useState(false);
  const [postsCount, setPostsCount] = useState(0);
  const [proofOrdersCount, setProofOrdersCount] = useState(0);

  const onBack = () => {
    nav("/account");
  };

  const onOpenPostsMenu = () => setIsPostsMenuOpen(true);
  const onClosePostsMenu = () => setIsPostsMenuOpen(false);

  const onGoToNewPost = () => {
    onClosePostsMenu();
    nav("/admin/posts/new");
  };

  const onGoToScheduled = () => {
    onClosePostsMenu();
    nav("/admin/posts/scheduled");
  };

  useEffect(() => {
    let mounted = true;
    const loadCounts = async () => {
      try {
        const [drafts, scheduled, proofOrders] = await Promise.all([
          listPostsByStatus("draft"),
          listPostsByStatus("scheduled"),
          listOrdersByStatuses(["payment_proof_submitted"]),
        ]);
        if (!mounted) return;
        setPostsCount(drafts.length + scheduled.length);
        setProofOrdersCount(proofOrders.length);
      } catch {
        if (!mounted) return;
        setPostsCount(0);
        setProofOrdersCount(0);
      }
    };

    void loadCounts();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Page title="Админка" subtitle="Продажи, заказы и операционная сводка">
      <div style={{ display: "grid", gap: 8 }}>
        <div className="admin-btn-with-badge">
          <Button variant="secondary" onClick={onOpenPostsMenu}>Посты</Button>
          {postsCount > 0 ? <span className="admin-btn-badge">{postsCount}</span> : null}
        </div>
        <div className="admin-btn-with-badge">
          <Button variant="secondary" onClick={() => nav("/admin/orders")}>Заказы</Button>
          {proofOrdersCount > 0 ? <span className="admin-btn-badge">{proofOrdersCount}</span> : null}
        </div>
        <Button variant="secondary" onClick={() => nav("/admin/post-video")}>Добавить видео в пост</Button>
        <Button variant="secondary" onClick={() => nav("/admin/drop-preview")}>Добавить превью</Button>
        <Button variant="secondary" onClick={onBack}>Назад</Button>
      </div>

      {isPostsMenuOpen ? (
        <div className="admin-posts-menu-overlay" onClick={onClosePostsMenu}>
          <div className="admin-posts-menu-dialog glass" onClick={(event) => event.stopPropagation()}>
            <div className="admin-posts-menu-dialog__title">Посты</div>
            <div className="admin-posts-menu-dialog__actions">
              <Button variant="secondary" onClick={onGoToNewPost}>Новый пост</Button>
              <Button variant="secondary" onClick={onGoToScheduled}>Черновики и отложенные</Button>
              <Button variant="secondary" onClick={onClosePostsMenu}>Отмена</Button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

export default AdminHome;
