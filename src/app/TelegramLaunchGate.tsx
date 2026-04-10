import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./telegram-launch-gate.css";

type GateState = "checking" | "telegram_allowed" | "outside_telegram";

type RuntimeProbe = {
  hasRuntime: boolean;
  hasInitData: boolean;
  hasTelegramUser: boolean;
};

const TELEGRAM_GATE_CHECK_WINDOW_MS = 1800;
const TELEGRAM_GATE_POLL_INTERVAL_MS = 90;

function probeTelegramRuntime(): RuntimeProbe {
  try {
    const webApp = window.Telegram?.WebApp;
    const hasRuntime = Boolean(webApp);
    if (!webApp) {
      return {
        hasRuntime: false,
        hasInitData: false,
        hasTelegramUser: false,
      };
    }

    const hasInitData = typeof webApp.initData === "string" && webApp.initData.trim().length > 0;
    const hasTelegramUser = typeof webApp.initDataUnsafe?.user?.id === "number" && webApp.initDataUnsafe.user.id > 0;

    return {
      hasRuntime,
      hasInitData,
      hasTelegramUser,
    };
  } catch (error) {
    console.error("[tg-launch-gate] probe runtime failed", error);
    return {
      hasRuntime: Boolean(window.Telegram?.WebApp),
      hasInitData: false,
      hasTelegramUser: false,
    };
  }
}

function hasStrongTelegramSignal(runtime: RuntimeProbe): boolean {
  return runtime.hasInitData || runtime.hasTelegramUser;
}

function resolveInitialState(): GateState {
  // Always start in checking mode to avoid false negatives while Telegram runtime initializes.
  return "checking";
}

function TelegramOutsideStub() {
  return (
    <div className="tg-launch-gate">
      <div className="tg-launch-gate__card glass">
        <div className="tg-launch-gate__title">AES ISLAND</div>
        <div className="tg-launch-gate__text">
          Приложение доступно только внутри Telegram Mini App.
        </div>
        <a className="tg-launch-gate__button" href="https://t.me/aesisland_bot" target="_blank" rel="noreferrer">
          Открыть в Telegram
        </a>
      </div>
    </div>
  );
}

export function TelegramLaunchGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(() => resolveInitialState());

  useEffect(() => {
    if (state !== "checking") return;

    let cancelled = false;
    const startedAt = Date.now();
    let lastRuntimeRef: { onEvent?: (eventType: string, eventHandler: () => void) => void; offEvent?: (eventType: string, eventHandler: () => void) => void } | null = null;

    const runCheck = () => {
      if (cancelled) return;
      try {
        const runtime = probeTelegramRuntime();
        const currentRuntime = window.Telegram?.WebApp ?? null;

        if (currentRuntime && lastRuntimeRef !== currentRuntime) {
          if (lastRuntimeRef) {
            lastRuntimeRef.offEvent?.("viewport_changed", runCheck);
            lastRuntimeRef.offEvent?.("theme_changed", runCheck);
          }
          currentRuntime.onEvent?.("viewport_changed", runCheck);
          currentRuntime.onEvent?.("theme_changed", runCheck);
          lastRuntimeRef = currentRuntime;
        }

        if (hasStrongTelegramSignal(runtime)) {
          setState("telegram_allowed");
          return;
        }

        if (Date.now() - startedAt >= TELEGRAM_GATE_CHECK_WINDOW_MS) {
          // Timeout reached: without initData/user signal we treat runtime as outside Telegram.
          setState("outside_telegram");
          return;
        }

        window.setTimeout(runCheck, TELEGRAM_GATE_POLL_INTERVAL_MS);
      } catch (error) {
        console.error("[tg-launch-gate] runCheck failed", error);
        setState("outside_telegram");
      }
    };

    runCheck();

    return () => {
      cancelled = true;
      if (lastRuntimeRef) {
        lastRuntimeRef.offEvent?.("viewport_changed", runCheck);
        lastRuntimeRef.offEvent?.("theme_changed", runCheck);
      }
    };
  }, [state]);

  const content = useMemo(() => {
    if (state === "telegram_allowed") return children;
    if (state === "outside_telegram") return <TelegramOutsideStub />;
    return <div className="tg-launch-gate tg-launch-gate--checking" />;
  }, [children, state]);

  return <>{content}</>;
}

export default TelegramLaunchGate;
