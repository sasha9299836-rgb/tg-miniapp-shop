import { useEffect, useState } from "react";

type DebugSnapshot = {
  hasTelegram: boolean;
  hasWebApp: boolean;
  rawUser: unknown;
  rawUserId: unknown;
  rawUserIdType: string;
};

function readSnapshot(): DebugSnapshot {
  const tg = window.Telegram?.WebApp;
  const rawUser = tg?.initDataUnsafe?.user;

  return {
    hasTelegram: !!window.Telegram,
    hasWebApp: !!tg,
    rawUser,
    rawUserId: rawUser?.id ?? null,
    rawUserIdType: typeof rawUser?.id,
  };
}

export function DebugTelegramBlock() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot>(() => readSnapshot());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnapshot(readSnapshot());
    }, 500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: "40vh",
        overflow: "auto",
        background: "rgba(0,0,0,0.9)",
        color: "#00ff88",
        fontSize: 10,
        zIndex: 999999,
        padding: 8,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(snapshot, null, 2)}
    </div>
  );
}

export default DebugTelegramBlock;
