import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isTgIdentityRequiredError, TG_IDENTITY_REQUIRED_MESSAGE } from "../../../shared/auth/tgUser";
import { useUserSessionReadiness } from "../../../shared/auth/useUserSessionReadiness";
import { getLoyaltyState, type LoyaltyState } from "../../../shared/api/loyaltyApi";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { Page } from "../../../shared/ui/Page";
import { LoyaltyHero } from "./LoyaltyHero";
import "./styles.css";

type LoyaltyLevelInfo = {
  level: 1 | 2 | 3 | 4 | 5;
  threshold: number;
  title: string;
  bonuses: string[];
};

const LEVELS: LoyaltyLevelInfo[] = [
  {
    level: 1,
    threshold: 1,
    title: "Level 1",
    bonuses: [
      "Одноразовая скидка 10% на заказ до 10 000 ₽",
      "Или 1 000 ₽ скидки на заказ свыше 10 000 ₽",
    ],
  },
  {
    level: 2,
    threshold: 15_000,
    title: "Level 2",
    bonuses: [
      "Ранний доступ к превью обновлений на 24 часа",
      "3 одноразовых промокода по 7%",
    ],
  },
  {
    level: 3,
    threshold: 40_000,
    title: "Level 3",
    bonuses: [
      "Скидка на доставку до 300 ₽",
      "Ранний доступ к обновлениям на 24 часа",
    ],
  },
  {
    level: 4,
    threshold: 80_000,
    title: "Level 4",
    bonuses: [
      "Постоянная скидка 10% на все товары",
    ],
  },
  {
    level: 5,
    threshold: 150_000,
    title: "Level 5",
    bonuses: [
      "Постоянная скидка 15% на все товары",
    ],
  },
];

function rub(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getLevelByNumber(level: number): LoyaltyLevelInfo {
  const found = LEVELS.find((entry) => entry.level === level);
  return found ?? LEVELS[0];
}

function getCurrentBonusLines(loyalty: LoyaltyState): string[] {
  const lines: string[] = [];
  if (loyalty.level >= 1) {
    lines.push("L1: одноразовая скидка 10%/1000 ₽");
  }
  if (loyalty.level >= 2) {
    lines.push("L2: ранний доступ к превью + 3 промокода по 7%");
  }
  if (loyalty.level >= 3) {
    lines.push("L3: скидка на доставку до 300 ₽");
  }
  if (loyalty.level >= 4) {
    lines.push("L4: постоянная скидка 10%");
  }
  if (loyalty.level >= 5) {
    lines.push("L5: постоянная скидка 15%");
  }
  return lines;
}

export function LoyaltyPage() {
  const nav = useNavigate();
  const { isReady, isChecking, errorText: readinessErrorText } = useUserSessionReadiness();
  const [loyalty, setLoyalty] = useState<LoyaltyState | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | 4 | 5>(1);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    const load = async () => {
      setLoadingText("Загрузка программы лояльности...");
      setErrorText(null);
      try {
        const state = await getLoyaltyState();
        if (cancelled) return;
        setLoyalty(state);
        const normalizedLevel = Math.max(1, Math.min(5, state.level || 1)) as 1 | 2 | 3 | 4 | 5;
        setSelectedLevel(normalizedLevel);
      } catch (error) {
        if (cancelled) return;
        if (isTgIdentityRequiredError(error)) {
          setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
        } else {
          setErrorText("Не удалось загрузить данные программы лояльности.");
        }
      } finally {
        if (!cancelled) setLoadingText(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isReady]);

  const currentLevel = useMemo(() => {
    if (!loyalty) return 1;
    return Math.max(1, Math.min(5, loyalty.level || 1)) as 1 | 2 | 3 | 4 | 5;
  }, [loyalty]);

  const currentLevelInfo = useMemo(() => getLevelByNumber(currentLevel), [currentLevel]);
  const selectedLevelInfo = useMemo(() => getLevelByNumber(selectedLevel), [selectedLevel]);
  const nextLevelInfo = useMemo(() => {
    if (!loyalty?.next_level) return null;
    return getLevelByNumber(Math.max(1, Math.min(5, loyalty.next_level)));
  }, [loyalty?.next_level]);

  const heroProgress = useMemo(() => {
    if (!loyalty) return 0;
    if (!loyalty.next_level_threshold || loyalty.next_level_threshold <= 0) return 1;
    const currentThreshold = currentLevelInfo.threshold;
    const range = Math.max(1, loyalty.next_level_threshold - currentThreshold);
    const passed = Math.max(0, loyalty.total_spent - currentThreshold);
    return Math.max(0, Math.min(1, passed / range));
  }, [loyalty, currentLevelInfo.threshold]);

  const currentBonusLines = useMemo(() => (loyalty ? getCurrentBonusLines(loyalty) : []), [loyalty]);

  const onPrevLevel = () => {
    setSelectedLevel((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4 | 5) : prev));
  };

  const onNextLevel = () => {
    setSelectedLevel((prev) => (prev < 5 ? ((prev + 1) as 1 | 2 | 3 | 4 | 5) : prev));
  };

  if (isChecking) {
    return (
      <Page>
        <div className="loyalty-page-state">Загрузка...</div>
      </Page>
    );
  }

  if (readinessErrorText) {
    return (
      <Page>
        <div className="loyalty-page-state loyalty-page-state--error">{readinessErrorText}</div>
        <Button variant="secondary" onClick={() => nav(-1)}>Назад</Button>
      </Page>
    );
  }

  return (
    <Page title="Программа лояльности" subtitle="Текущий уровень, прогресс и бонусы по реальным данным.">
      {loadingText ? <div className="loyalty-page-state">{loadingText}</div> : null}
      {errorText ? <div className="loyalty-page-state loyalty-page-state--error">{errorText}</div> : null}

      {loyalty ? (
        <>
          <LoyaltyHero
            currentLevel={currentLevel}
            totalSpentRub={loyalty.total_spent}
            progress={heroProgress}
            amountToNextLevelRub={loyalty.amount_to_next_level}
            nextLevel={nextLevelInfo?.level ?? null}
            currentBonuses={currentBonusLines}
            nextLevelBonuses={nextLevelInfo?.bonuses ?? []}
          />

          <Card className="ui-card--padded loyalty-selector-card">
            <div className="loyalty-selector__top">
              <Button variant="secondary" onClick={onPrevLevel} disabled={selectedLevel <= 1}>←</Button>
              <div className="loyalty-selector__title">{selectedLevelInfo.title}</div>
              <Button variant="secondary" onClick={onNextLevel} disabled={selectedLevel >= 5}>→</Button>
            </div>

            <div className="loyalty-selector__meta">
              <div>Порог: от {rub(selectedLevelInfo.threshold)}</div>
              <div>
                Статус:{" "}
                {selectedLevel < currentLevel ? "Достигнут" : selectedLevel === currentLevel ? "Текущий" : "Следующий"}
              </div>
            </div>

            <div className="loyalty-selector__bonuses-title">Бонусы уровня:</div>
            <ul className="loyalty-selector__bonuses">
              {selectedLevelInfo.bonuses.map((bonus) => (
                <li key={`${selectedLevelInfo.level}-${bonus}`}>{bonus}</li>
              ))}
            </ul>
          </Card>

          <div className="loyalty-grid">
            {LEVELS.map((entry) => {
              const achieved = currentLevel >= entry.level;
              const isCurrent = currentLevel === entry.level;
              const isSelected = selectedLevel === entry.level;
              return (
                <Card
                  key={entry.level}
                  className={`ui-card--padded loyalty-card${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelectedLevel(entry.level)}
                >
                  <div className="loyalty-card__head">
                    <div className="loyalty-card__title">{entry.title}</div>
                    <div className="loyalty-card__discount">{rub(entry.threshold)}</div>
                  </div>
                  <div className="loyalty-card__desc">
                    {isCurrent ? "Текущий уровень" : achieved ? "Уровень достигнут" : "Ещё не достигнут"}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      <Button variant="secondary" onClick={() => nav(-1)}>
        Назад
      </Button>
    </Page>
  );
}

export default LoyaltyPage;

