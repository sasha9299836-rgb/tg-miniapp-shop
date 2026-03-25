import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./app/providers/AppProviders";
import { AppRouter } from "./app/router/AppRouter";
import { ThemeGate } from "./shared/theme/ThemeGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <ThemeGate>
        <AppRouter />
      </ThemeGate>
    </AppProviders>
  </React.StrictMode>
);
