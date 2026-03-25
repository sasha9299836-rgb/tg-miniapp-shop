import { useEffect } from "react";
import { useThemeStore } from "./useThemeStore";

export function ThemeGate({ children }: { children: React.ReactNode }) {
  const { mode, setMode, hydrate } = useThemeStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Если тема выбрана — просто рендерим приложение
  if (mode) return <>{children}</>;

  // Иначе — красивый “первый экран” выбора темы
  return (
    <div className="themeGate">
      <div className="themeGate__card glass">
        <div className="themeGate__title">Выбери тему</div>
        <div className="themeGate__text">
          Ты всегда сможешь поменять её позже в аккаунте.
        </div>

        <div className="themeGate__grid">
          <button className="themeGate__choice glass" onClick={() => setMode("light")}>
            <div className="themeGate__preview themeGate__preview--light" />
            <div className="themeGate__label">Светлая</div>
          </button>

          <button className="themeGate__choice glass" onClick={() => setMode("dark")}>
            <div className="themeGate__preview themeGate__preview--dark" />
            <div className="themeGate__label">Тёмная</div>
          </button>
        </div>
      </div>
    </div>
  );
}
