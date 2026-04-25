import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../../shared/ui/Page";
import { Button } from "../../../shared/ui/Button";
import { ProductThumb } from "../../../shared/ui/ProductThumb";
import {
  deleteDraftOrScheduledPost,
  listPostsByStatus,
  publishPostNow,
  schedulePost,
  unschedulePost,
  type ScheduledPostListItem,
} from "../../../shared/api/adminPostsApi";
import { AdminDateTimeField } from "../DateTimeField";
import "../datetime-controls.css";
import "./styles.css";

type Tab = "draft" | "scheduled";

function moscowDateTimeLocalToIso(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const utcMs = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) - 3, Number(mm), 0);
  return new Date(utcMs).toISOString();
}

function formatMoscow(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function normalizeInterval(input: string): string {
  if (!input) return "";
  const digitsOnly = input.replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return String(Number.parseInt(digitsOnly, 10));
}

function TabBadge({ value }: { value: number }) {
  if (value <= 0) return null;

  return (
    <span
      style={{
        position: "absolute",
        top: -7,
        right: -8,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "var(--accent-strong)",
        color: "#fff",
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        border: "1px solid color-mix(in srgb, var(--surface) 85%, transparent)",
      }}
    >
      {value}
    </span>
  );
}

export function AdminScheduledPostsPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("draft");
  const [drafts, setDrafts] = useState<ScheduledPostListItem[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPostListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startDateTime, setStartDateTime] = useState("");
  const [intervalMinInput, setIntervalMinInput] = useState("5");
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkScheduling, setIsBulkScheduling] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const activeItems = useMemo(() => (tab === "draft" ? drafts : scheduled), [tab, drafts, scheduled]);

  const load = async () => {
    setIsLoading(true);
    try {
      const [draftRows, scheduledRows] = await Promise.all([listPostsByStatus("draft"), listPostsByStatus("scheduled")]);
      setDrafts(draftRows);
      setScheduled(scheduledRows);
    } catch (error) {
      setErrorText(`Ошибка загрузки: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const onBulkSchedule = async () => {
    setErrorText(null);
    setSuccessText(null);
    const startIso = moscowDateTimeLocalToIso(startDateTime);
    if (!startIso) {
      setErrorText("Укажите корректное время начала публикации.");
      return;
    }

    const parsedInterval = Number.parseInt(intervalMinInput, 10);
    const interval = Number.isFinite(parsedInterval) ? parsedInterval : 1;
    if (interval < 1 || interval > 1440) {
      setErrorText("Интервал должен быть от 1 до 1440 минут.");
      return;
    }

    const orderedSelected = activeItems.filter((item) => selectedIds.includes(item.post.id));
    if (!orderedSelected.length) {
      setErrorText("Выберите хотя бы один черновик.");
      return;
    }

    setIsBulkScheduling(true);
    try {
      for (let i = 0; i < orderedSelected.length; i += 1) {
        const item = orderedSelected[i];
        const time = addMinutes(startIso, i * interval);
        await schedulePost(item.post.id, time);
      }
      setSelectedIds([]);
      setSuccessText("Выбранные посты запланированы по интервалу.");
      await load();
    } catch (error) {
      setErrorText(`Ошибка планирования: ${(error as Error).message}`);
    } finally {
      setIsBulkScheduling(false);
    }
  };

  const onPublishNow = async (postId: string) => {
    setErrorText(null);
    setSuccessText(null);
    try {
      await publishPostNow(postId);
      setSuccessText("Пост опубликован.");
      await load();
    } catch (error) {
      setErrorText(`Ошибка публикации: ${(error as Error).message}`);
    }
  };

  const onUnschedule = async (postId: string) => {
    setErrorText(null);
    setSuccessText(null);
    try {
      await unschedulePost(postId);
      setSuccessText("Пост возвращен в черновики.");
      await load();
    } catch (error) {
      setErrorText(`Ошибка снятия с публикации: ${(error as Error).message}`);
    }
  };

  const onDeletePost = async (postId: string) => {
    setErrorText(null);
    setSuccessText(null);
    const text = tab === "draft"
      ? "Удалить черновик? Действие необратимо."
      : "Удалить отложенный пост? Действие необратимо.";
    if (!window.confirm(text)) return;

    try {
      await deleteDraftOrScheduledPost(postId);
      setSelectedIds((prev) => prev.filter((id) => id !== postId));
      setSuccessText(tab === "draft" ? "Черновик удален." : "Отложенный пост удален.");
      await load();
    } catch (error) {
      setErrorText(`Ошибка удаления: ${(error as Error).message}`);
    }
  };

  return (
    <Page title="Черновики и отложенные" subtitle="Управление статусами публикации">
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", display: "inline-flex" }}>
            <Button variant={tab === "draft" ? "primary" : "secondary"} onClick={() => setTab("draft")}>
              Черновики
            </Button>
            <TabBadge value={drafts.length} />
          </div>
          <div style={{ position: "relative", display: "inline-flex" }}>
            <Button variant={tab === "scheduled" ? "primary" : "secondary"} onClick={() => setTab("scheduled")}>
              Отложенные
            </Button>
            <TabBadge value={scheduled.length} />
          </div>
        </div>

        {tab === "draft" ? (
          <div className="glass" style={{ padding: 12, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Планирование публикации</div>
            <AdminDateTimeField
              label="Начало публикации"
              value={startDateTime}
              onChange={setStartDateTime}
            />
            <label>
              Интервал, минут
              <input
                type="text"
                inputMode="numeric"
                value={intervalMinInput}
                onChange={(e) => setIntervalMinInput(normalizeInterval(e.target.value))}
                onBlur={() => {
                  const parsed = Number.parseInt(intervalMinInput, 10);
                  if (!Number.isFinite(parsed) || parsed < 1) {
                    setIntervalMinInput("1");
                    return;
                  }
                  if (parsed > 1440) {
                    setIntervalMinInput("1440");
                    return;
                  }
                  setIntervalMinInput(String(parsed));
                }}
                style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
              />
            </label>
            <Button variant="secondary" onClick={onBulkSchedule} disabled={isBulkScheduling}>
              {isBulkScheduling ? "Планирование..." : "Запланировать выбранные"}
            </Button>
          </div>
        ) : null}

        {isLoading ? <div>Загрузка...</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          {activeItems.map((entry) => {
            const remaining = entry.photoCount - entry.previewUrls.length;
            return (
              <div
                key={entry.post.id}
                className="glass"
                style={{ padding: 12, display: "grid", gap: 8, cursor: "pointer" }}
                onClick={() => nav(`/admin/posts/${entry.post.id}/edit`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>{entry.post.title}</div>
                  {tab === "draft" ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(entry.post.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleId(entry.post.id)}
                    />
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {entry.previewUrls.length === 0 ? (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.06)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--muted)",
                        fontSize: 11,
                      }}
                    >
                      Фото нет
                    </div>
                  ) : (
                    entry.previewUrls.map((url, index) => (
                      <div key={`${entry.post.id}-preview-${index}`} style={{ position: "relative" }}>
                        <ProductThumb
                          src={url}
                          alt={`Фото ${index + 1}`}
                          className="scheduled-posts__preview-thumb"
                        />
                        {index === entry.previewUrls.length - 1 && remaining > 0 ? (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: 8,
                              background: "rgba(0,0,0,0.45)",
                              color: "#fff",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            +{remaining}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                <div>Фото: {entry.photoCount}</div>
                {tab === "scheduled" ? <div>Запланировано: {formatMoscow(entry.post.scheduled_at)}</div> : null}

                <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <Button variant="secondary" onClick={() => void onPublishNow(entry.post.id)}>
                    Опубликовать
                  </Button>
                  <Button variant="secondary" onClick={() => void onDeletePost(entry.post.id)}>
                    Удалить
                  </Button>
                  {tab === "scheduled" ? (
                    <Button variant="secondary" onClick={() => void onUnschedule(entry.post.id)}>
                      Снять с публикации
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!isLoading && activeItems.length === 0 ? <div style={{ color: "var(--muted)" }}>Список пуст.</div> : null}
        </div>

        <Button variant="secondary" onClick={() => nav("/admin")}>Назад</Button>
        {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}
        {successText ? <div style={{ color: "#067647" }}>{successText}</div> : null}
      </div>
    </Page>
  );
}

export default AdminScheduledPostsPage;
