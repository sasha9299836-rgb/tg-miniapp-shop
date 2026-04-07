import { useMemo } from "react";
import { useTgDebugSnapshot } from "./tgDebug";

function formatBool(value: boolean) {
  return value ? "yes" : "no";
}

export function TgDebugPanel() {
  const snapshot = useTgDebugSnapshot();

  const rows = useMemo(
    () => [
      ["debug_id", snapshot.debugId],
      ["runtime", formatBool(snapshot.runtimeDetected)],
      ["initData", formatBool(snapshot.initDataPresent)],
      ["initData_length", String(snapshot.initDataLength)],
      ["verify_requested", formatBool(snapshot.verifyRequested)],
      ["verify_success", formatBool(snapshot.verifySuccess)],
      ["session_token", formatBool(snapshot.sessionTokenPresent)],
      ["session_expires", formatBool(snapshot.sessionExpiresPresent)],
      ["current_user_loaded", formatBool(snapshot.currentUserLoaded)],
      ["telegram_id_present", formatBool(snapshot.currentUserTelegramIdPresent)],
      ["is_admin", String(snapshot.currentUserIsAdmin)],
      ["last_auth_error", snapshot.lastAuthErrorCode ?? "-"],
      ["last_collections_error", snapshot.lastCollectionsErrorCode ?? "-"],
    ],
    [snapshot],
  );

  if (!snapshot.debugEnabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        zIndex: 9999,
        width: 280,
        maxHeight: "45vh",
        overflow: "auto",
        background: "rgba(15,23,42,0.92)",
        color: "#e2e8f0",
        borderRadius: 10,
        padding: 10,
        fontSize: 11,
        lineHeight: 1.35,
        border: "1px solid rgba(148,163,184,0.45)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>TG Debug</div>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ opacity: 0.85 }}>{label}</span>
            <span style={{ textAlign: "right", wordBreak: "break-all" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TgDebugPanel;
