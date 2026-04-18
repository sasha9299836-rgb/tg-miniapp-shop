import { Card } from "../../../shared/ui/Card";
import { LoyaltyBadge } from "../../../shared/ui/LoyaltyBadge";
import "./LoyaltyHero.css";

type LoyaltyHeroProps = {
  currentLevel: number;
  selectedLevel: number;
  totalSpentRub: number;
  progress: number;
  amountToNextLevelRub: number;
  nextLevel: 1 | 2 | 3 | 4 | 5 | null;
  currentBonuses: string[];
  nextLevelBonuses: string[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function LoyaltyHero({
  currentLevel,
  selectedLevel,
  totalSpentRub,
  progress,
  amountToNextLevelRub,
  nextLevel,
  currentBonuses,
  nextLevelBonuses,
}: LoyaltyHeroProps) {
  const safeProgress = clamp(progress, 0, 1);
  const badgeLevel = clamp(selectedLevel, 1, 5) as 1 | 2 | 3 | 4 | 5;

  return (
    <Card className="ui-card--padded loyalty-hero-card">
      <div className="loyalty-hero">
        <div className="loyalty-hero__symbol">
          <LoyaltyBadge level={badgeLevel} percentLabel={`L${selectedLevel}`} size={168} />
        </div>

        <div className="loyalty-hero__meta">
          <div className="loyalty-hero__title">Текущий уровень: Level {currentLevel}</div>
          <div className="loyalty-hero__subtitle">Сумма подтверждённых покупок: {totalSpentRub.toLocaleString("ru-RU")} ₽</div>
        </div>

        <div className="loyalty-hero__progress">
          <div className="loyalty-hero__progressText">
            {nextLevel
              ? `До Level ${nextLevel} осталось ${amountToNextLevelRub.toLocaleString("ru-RU")} ₽`
              : "Максимальный уровень достигнут"}
          </div>
          <div className="loyalty-hero__bar">
            <div className="loyalty-hero__barFill" style={{ width: `${Math.round(safeProgress * 100)}%` }} />
          </div>
        </div>

        <div className="loyalty-hero__benefits">
          {currentBonuses.length ? (
            <>
              <div className="loyalty-hero__benefits-title">Ваши текущие бонусы:</div>
              <ul className="loyalty-hero__benefits-list">
                {currentBonuses.map((line) => (
                  <li key={`current-${line}`}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
          {nextLevel && nextLevelBonuses.length ? (
            <>
              <div className="loyalty-hero__benefits-title">На следующем уровне:</div>
              <ul className="loyalty-hero__benefits-list">
                {nextLevelBonuses.map((line) => (
                  <li key={`next-${line}`}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default LoyaltyHero;
