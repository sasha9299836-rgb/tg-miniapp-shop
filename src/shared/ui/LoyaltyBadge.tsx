import { useId, useMemo } from "react";
import "./LoyaltyBadge.css";

type LoyaltyBadgeProps = {
  level: 1 | 2 | 3 | 4 | 5;
  percentLabel: string;
  size?: number;
};

const hexPoints = (r: number, cx = 50, cy = 50, rotate = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = ((Math.PI * 2) / 6) * i + (rotate * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`);
  }
  return pts.join(" ");
};

const octPoints = (r: number, cx = 50, cy = 50, rotate = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = ((Math.PI * 2) / 8) * i + (rotate * Math.PI) / 180;
    pts.push(`${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`);
  }
  return pts.join(" ");
};

const rayPolygons = (count: number, innerR: number, outerR: number, cx = 50, cy = 50) => {
  const rays: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((Math.PI * 2) / count) * i - Math.PI / 2;
    const angleLeft = angle - Math.PI / count / 2;
    const angleRight = angle + Math.PI / count / 2;
    const p1 = `${(cx + Math.cos(angleLeft) * innerR).toFixed(2)},${(cy + Math.sin(angleLeft) * innerR).toFixed(2)}`;
    const p2 = `${(cx + Math.cos(angle) * outerR).toFixed(2)},${(cy + Math.sin(angle) * outerR).toFixed(2)}`;
    const p3 = `${(cx + Math.cos(angleRight) * innerR).toFixed(2)},${(cy + Math.sin(angleRight) * innerR).toFixed(2)}`;
    rays.push(`${p1} ${p2} ${p3}`);
  }
  return rays;
};

export function LoyaltyBadge({ level, percentLabel, size = 96 }: LoyaltyBadgeProps) {
  const uid = useId();
  const outerHex = useMemo(() => hexPoints(44), []);
  const innerHex = useMemo(() => hexPoints(34), []);
  const oct = useMemo(() => octPoints(44), []);
  const octInner = useMemo(() => octPoints(30), []);
  const rays = useMemo(() => rayPolygons(12, 44, 54), []);

  return (
    <svg
      className={`loyalty-badge loyalty-badge--l${level}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="55%" stopColor="#ffb327" />
          <stop offset="100%" stopColor="#f08a00" />
        </linearGradient>
        <linearGradient id={`g-strong-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1b5" />
          <stop offset="40%" stopColor="#ffc64a" />
          <stop offset="100%" stopColor="#f07c00" />
        </linearGradient>
        <linearGradient id={`g-ray-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,214,129,0.9)" />
          <stop offset="100%" stopColor="rgba(255,158,34,0.1)" />
        </linearGradient>
        <filter id={`shadow-soft-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.2)" />
        </filter>
        <filter id={`shadow-strong-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(255,172,20,0.35)" />
        </filter>
      </defs>

      {level === 4 || level === 5 ? (
        <g className="loyalty-badge__rays">
          {rays.map((p, idx) => (
            <polygon key={`ray-${idx}`} points={p} fill={`url(#g-ray-${uid})`} />
          ))}
        </g>
      ) : null}

      {level === 1 ? (
        <g filter={`url(#shadow-soft-${uid})`}>
          <polygon points={outerHex} fill={`url(#g-${uid})`} />
        </g>
      ) : null}

      {level === 2 ? (
        <g filter={`url(#shadow-soft-${uid})`}>
          <polygon points={outerHex} fill={`url(#g-${uid})`} />
          <polygon
            points={innerHex}
            fill="rgba(255,255,255,0.15)"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon points="50,10 82,34 50,40" fill="rgba(255,255,255,0.35)" />
          <polygon points="50,90 18,66 50,60" fill="rgba(0,0,0,0.08)" />
        </g>
      ) : null}

      {level === 3 ? (
        <g filter={`url(#shadow-soft-${uid})`}>
          <polygon points={oct} fill={`url(#g-${uid})`} />
          <polygon
            points={octInner}
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon points="50,8 72,22 60,36" fill="rgba(255,255,255,0.28)" />
          <polygon points="72,22 88,46 66,48" fill="rgba(255,255,255,0.2)" />
          <polygon points="88,46 80,72 64,56" fill="rgba(255,255,255,0.16)" />
          <polygon points="50,92 28,78 40,64" fill="rgba(0,0,0,0.08)" />
          <polygon points="28,78 12,54 34,52" fill="rgba(0,0,0,0.06)" />
          <polygon points="12,54 20,28 36,44" fill="rgba(0,0,0,0.07)" />
        </g>
      ) : null}

      {level === 4 ? (
        <g filter={`url(#shadow-strong-${uid})`}>
          <polygon points={outerHex} fill={`url(#g-strong-${uid})`} />
          <polygon
            points={innerHex}
            fill="rgba(255,255,255,0.16)"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon points="50,10 80,32 50,40" fill="rgba(255,255,255,0.34)" />
          <polygon points="80,32 88,60 62,56" fill="rgba(255,255,255,0.23)" />
          <polygon points="20,32 50,40 20,60" fill="rgba(255,255,255,0.16)" />
          <polygon points="50,90 20,68 50,60" fill="rgba(0,0,0,0.08)" />
          <polygon points="80,68 50,60 80,40" fill="rgba(0,0,0,0.05)" />
        </g>
      ) : null}

      {level === 5 ? (
        <g filter={`url(#shadow-strong-${uid})`}>
          <polygon points={outerHex} fill={`url(#g-strong-${uid})`} />
          <polygon
            points={innerHex}
            fill="rgba(255,255,255,0.14)"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points={hexPoints(28)}
            fill="rgba(255,255,255,0.1)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon points="50,10 80,32 50,40" fill="rgba(255,255,255,0.35)" />
          <polygon points="80,32 88,60 62,56" fill="rgba(255,255,255,0.24)" />
          <polygon points="20,32 50,40 20,60" fill="rgba(255,255,255,0.16)" />
          <polygon points="50,90 20,68 50,60" fill="rgba(0,0,0,0.08)" />
          <polygon points="80,68 50,60 80,40" fill="rgba(0,0,0,0.05)" />
          <g className="loyalty-badge__drops">
            <circle cx="18" cy="28" r="1.9" />
            <circle cx="82" cy="22" r="2.1" />
            <circle cx="88" cy="74" r="1.5" />
            <circle cx="12" cy="68" r="1.7" />
            <circle cx="82" cy="86" r="1.4" />
            <circle cx="18" cy="86" r="1.3" />
          </g>
        </g>
      ) : null}

      <text x="50" y="52" textAnchor="middle" dominantBaseline="middle" className="loyalty-badge__text">
        {percentLabel}
      </text>
    </svg>
  );
}

export default LoyaltyBadge;
