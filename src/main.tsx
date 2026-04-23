import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./app/providers/AppProviders";
import { AppRouter } from "./app/router/AppRouter";
import { TelegramLaunchGate } from "./app/TelegramLaunchGate";
import { useThemeStore } from "./shared/theme/useThemeStore";
import "./index.css";

useThemeStore.getState().hydrate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TelegramLaunchGate>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </TelegramLaunchGate>
  </React.StrictMode>
);
