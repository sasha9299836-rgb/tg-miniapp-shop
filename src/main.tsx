import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./app/providers/AppProviders";
import { AppRouter } from "./app/router/AppRouter";
import { TelegramLaunchGate } from "./app/TelegramLaunchGate";
import { ThemeGate } from "./shared/theme/ThemeGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TelegramLaunchGate>
      <AppProviders>
        <ThemeGate>
          <AppRouter />
        </ThemeGate>
      </AppProviders>
    </TelegramLaunchGate>
  </React.StrictMode>
);
