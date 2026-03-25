import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { Page } from "../../../shared/ui/Page";
import { LoyaltyHero } from "./LoyaltyHero";
import "./styles.css";

const levels = [
  { name: "Level 1", discount: 3, need: 50_000 },
  { name: "Level 2", discount: 5, need: 120_000 },
  { name: "Level 3", discount: 7, need: 250_000 },
  { name: "Level 4", discount: 10, need: 400_000 },
  { name: "Level 5", discount: 12, need: 600_000 },
];

const spentRub = 88_000;

const percentLabels: Record<number, string> = {
  1: "0.5%",
  2: "1%",
  3: "3%",
  4: "5%",
  5: "7%",
};

function rub(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export function LoyaltyPage() {
  const nav = useNavigate();

  const model = useMemo(() => {
    const nextIndex = levels.findIndex((l) => spentRub < l.need);
    const achievedIndex = nextIndex === -1 ? levels.length - 1 : Math.max(0, nextIndex - 1);
    const next = nextIndex === -1 ? null : levels[nextIndex];
    const currentLevel = levels[achievedIndex] ?? levels[0];
    const nextLevel = next ?? levels[levels.length - 1];
    return {
      nextIndex,
      achievedIndex,
      next,
      currentLevel,
      nextLevel,
    };
  }, []);

  const currentLevelNumber = model.achievedIndex + 1;
  const nextLevelNumber = Math.min(levels.length, currentLevelNumber + 1);
  const percent = model.currentLevel.discount;
  const percentLabel = percentLabels[currentLevelNumber] ?? `${percent}%`;
  const nextThreshold = model.next?.need ?? model.currentLevel.need;

  return (
    <Page title="Программа лояльности" subtitle="Твой прогресс и уровни скидок.">
      <LoyaltyHero
        currentLevel={currentLevelNumber}
        percentLabel={percentLabel}
        spentRub={spentRub}
        nextLevel={nextLevelNumber}
        nextLevelThresholdRub={nextThreshold}
      />

      <div className="loyalty-grid">
        {levels.map((l, idx) => {
          const achieved = spentRub >= l.need;
          const isCurrent = idx === model.nextIndex;
          return (
            <Card key={l.name} className="ui-card--padded loyalty-card">
              <div className="loyalty-card__head">
                <div className="loyalty-card__title">
                  {l.name} {isCurrent ? "· текущий" : ""}
                </div>
                <div className="loyalty-card__discount">{l.discount}%</div>
              </div>

              <div className="loyalty-card__desc">Нужно покупок на {rub(l.need)}</div>

              <div className="loyalty-card__status">
                <span className={`loyalty-pill ${achieved ? "is-done" : ""}`}>
                  {achieved ? "Достигнут" : "В процессе"}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <Button variant="secondary" onClick={() => nav(-1)}>
        Назад
      </Button>
    </Page>
  );
}

export default LoyaltyPage;
