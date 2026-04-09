import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./telegram-launch-gate.css";

type GateState = "checking" | "telegram_allowed" | "outside_telegram";

type RuntimeProbe = {
  hasRuntime: boolean;
  hasInitData: boolean;
  hasTelegramUser: boolean;
};

function probeTelegramRuntime(): RuntimeProbe {
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
}

function hasStrongTelegramSignal(runtime: RuntimeProbe): boolean {
  return runtime.hasInitData || runtime.hasTelegramUser;
}

function resolveInitialState(): GateState {
  const runtime = probeTelegramRuntime();
  if (!runtime.hasRuntime) return "outside_telegram";
  if (hasStrongTelegramSignal(runtime)) return "telegram_allowed";
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

    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      setState("outside_telegram");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const checkWindowMs = 1800;

    const runCheck = () => {
      if (cancelled) return;
      const runtime = probeTelegramRuntime();

      if (!runtime.hasRuntime) {
        setState("outside_telegram");
        return;
      }

      if (hasStrongTelegramSignal(runtime)) {
        setState("telegram_allowed");
        return;
      }

      if (Date.now() - startedAt >= checkWindowMs) {
        setState("outside_telegram");
        return;
      }

      window.setTimeout(runCheck, 90);
    };

    const onRuntimeEvent = () => {
      if (!cancelled) runCheck();
    };

    webApp.onEvent?.("viewport_changed", onRuntimeEvent);
    webApp.onEvent?.("theme_changed", onRuntimeEvent);
    runCheck();

    return () => {
      cancelled = true;
      webApp.offEvent?.("viewport_changed", onRuntimeEvent);
      webApp.offEvent?.("theme_changed", onRuntimeEvent);
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
