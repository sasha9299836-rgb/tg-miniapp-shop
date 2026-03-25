import { useEffect, type ReactNode } from "react";
import { initTelegramWebApp } from "./telegram";

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    initTelegramWebApp();
  }, []);

  return <>{children}</>;
}
