import { Card } from "../../../shared/ui/Card";
import { LoyaltyBadge } from "../../../shared/ui/LoyaltyBadge";
import "./LoyaltyHero.css";

type LoyaltyHeroProps = {
  currentLevel: number;
  percentLabel: string;
  spentRub: number;
  nextLevel: number;
  nextLevelThresholdRub: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function LoyaltyHero({
  currentLevel,
  percentLabel,
  spentRub,
  nextLevel,
  nextLevelThresholdRub,
}: LoyaltyHeroProps) {
  const remainingRub = Math.max(0, nextLevelThresholdRub - spentRub);
  const progress = clamp(spentRub / nextLevelThresholdRub, 0, 1);
  const safeLevel = Math.min(5, Math.max(1, currentLevel)) as 1 | 2 | 3 | 4 | 5;

  return (
    <Card className="ui-card--padded loyalty-hero-card">
      <div className="loyalty-hero">
        <div className="loyalty-hero__symbol">
          <LoyaltyBadge level={safeLevel} percentLabel={percentLabel} size={168} />
        </div>

        <div className="loyalty-hero__meta">
          <div className="loyalty-hero__title">Текущий уровень: Level {currentLevel}</div>
          <div className="loyalty-hero__subtitle">Кешбэк {percentLabel} с каждой покупки</div>
        </div>

        <div className="loyalty-hero__progress">
          <div className="loyalty-hero__progressText">
            До Level {nextLevel} осталось {remainingRub.toLocaleString("ru-RU")} ₽
          </div>
          <div className="loyalty-hero__bar">
            <div className="loyalty-hero__barFill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default LoyaltyHero;
