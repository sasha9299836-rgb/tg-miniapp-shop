import { useId, useMemo } from "react";
import "./LoyaltyCrystal.css";

type Sparkle = { x: number; y: number; r: number; twinkle?: boolean };

type CrystalShape = {
  core: string;
  inner: string;
  backFacets: string[];
  frontFacets: string[];
  crown: string[];
  shards: string[];
  highlights: string[];
  sparkles: Sparkle[];
  glow: number;
};

type LoyaltyCrystalProps = {
  level: 1 | 2 | 3 | 4 | 5;
  percent: number;
  size?: number;
};

const PRESETS: Record<LoyaltyCrystalProps["level"], CrystalShape> = {
  1: {
    core: "M100 6 L124 30 L148 66 L160 112 L140 166 L116 206 L100 236 L84 206 L60 166 L40 112 L52 66 L76 30 Z",
    inner: "M100 58 L118 80 L130 112 L120 146 L108 174 L100 186 L92 174 L80 146 L70 112 L82 80 Z",
    backFacets: [
      "M100 6 L124 30 L100 46 Z",
      "M76 30 L100 46 L100 6 Z",
      "M40 112 L60 166 L52 66 Z",
      "M160 112 L148 66 L140 166 Z",
    ],
    frontFacets: [
      "M124 30 L148 66 L116 84 Z",
      "M52 66 L84 84 L76 30 Z",
      "M148 66 L160 112 L126 118 Z",
      "M40 112 L74 118 L52 66 Z",
      "M160 112 L140 166 L118 150 Z",
      "M60 166 L82 150 L40 112 Z",
    ],
    crown: [
      "M100 6 L124 30 L100 38 Z",
      "M76 30 L100 38 L100 6 Z",
      "M124 30 L148 48 L118 64 Z",
      "M76 30 L84 64 L52 48 Z",
    ],
    shards: [
      "M32 94 L10 120 L36 136 Z",
      "M168 94 L190 120 L164 136 Z",
      "M92 200 L100 236 L108 200 Z",
    ],
    highlights: [
      "M100 14 L122 38 L104 66 Z",
      "M68 98 L92 118 L74 136 Z",
    ],
    sparkles: [
      { x: 26, y: 36, r: 2.0, twinkle: true },
      { x: 174, y: 38, r: 1.6 },
      { x: 12, y: 120, r: 1.3 },
      { x: 188, y: 124, r: 1.4, twinkle: true },
      { x: 44, y: 190, r: 1.1 },
      { x: 156, y: 196, r: 1.2 },
      { x: 100, y: 14, r: 1.1 },
      { x: 78, y: 18, r: 1.0 },
    ],
    glow: 0.18,
  },
  2: {
    core: "M100 4 L128 26 L156 62 L170 112 L150 176 L124 214 L100 240 L76 214 L50 176 L30 112 L44 62 L72 26 Z",
    inner: "M100 52 L124 78 L138 114 L126 152 L112 182 L100 194 L88 182 L74 152 L62 114 L76 78 Z",
    backFacets: [
      "M100 4 L128 26 L100 44 Z",
      "M72 26 L100 44 L100 4 Z",
      "M30 112 L50 176 L44 62 Z",
      "M170 112 L156 62 L150 176 Z",
      "M124 214 L100 240 L116 206 Z",
    ],
    frontFacets: [
      "M128 26 L156 62 L118 84 Z",
      "M44 62 L82 84 L72 26 Z",
      "M156 62 L170 112 L130 118 Z",
      "M30 112 L70 118 L44 62 Z",
      "M170 112 L150 176 L122 154 Z",
      "M50 176 L78 154 L30 112 Z",
      "M78 154 L100 176 L122 154 Z",
    ],
    crown: [
      "M100 4 L128 26 L100 36 Z",
      "M72 26 L100 36 L100 4 Z",
      "M128 26 L156 46 L120 66 Z",
      "M72 26 L80 66 L44 46 Z",
      "M100 4 L100 28 L86 40 Z",
    ],
    shards: [
      "M24 88 L0 120 L30 140 Z",
      "M176 88 L200 120 L170 140 Z",
      "M86 202 L100 240 L114 202 Z",
      "M56 160 L36 178 L70 184 Z",
      "M144 160 L164 178 L130 184 Z",
    ],
    highlights: [
      "M100 10 L130 34 L106 72 Z",
      "M66 100 L92 122 L72 144 Z",
      "M114 74 L140 98 L118 130 Z",
    ],
    sparkles: [
      { x: 22, y: 32, r: 2.1, twinkle: true },
      { x: 178, y: 34, r: 1.6 },
      { x: 6, y: 116, r: 1.4 },
      { x: 194, y: 120, r: 1.5, twinkle: true },
      { x: 34, y: 192, r: 1.2 },
      { x: 166, y: 198, r: 1.2 },
      { x: 100, y: 12, r: 1.1 },
      { x: 76, y: 8, r: 1.0 },
      { x: 126, y: 8, r: 1.0 },
    ],
    glow: 0.22,
  },
  3: {
    core: "M100 2 L130 22 L162 58 L178 110 L158 182 L130 220 L100 242 L70 220 L42 182 L22 110 L38 58 L70 22 Z",
    inner: "M100 50 L130 78 L146 116 L132 158 L114 190 L100 204 L86 190 L68 158 L54 116 L70 78 Z",
    backFacets: [
      "M100 2 L130 22 L100 42 Z",
      "M70 22 L100 42 L100 2 Z",
      "M22 110 L42 182 L38 58 Z",
      "M178 110 L162 58 L158 182 Z",
      "M130 220 L100 242 L116 208 Z",
      "M70 220 L84 208 L100 242 Z",
    ],
    frontFacets: [
      "M130 22 L162 58 L120 84 Z",
      "M38 58 L80 84 L70 22 Z",
      "M162 58 L178 110 L134 118 Z",
      "M22 110 L66 118 L38 58 Z",
      "M178 110 L158 182 L122 154 Z",
      "M42 182 L78 154 L22 110 Z",
      "M78 154 L100 178 L122 154 Z",
      "M100 84 L124 96 L100 112 L76 96 Z",
    ],
    crown: [
      "M100 2 L130 22 L100 34 Z",
      "M70 22 L100 34 L100 2 Z",
      "M130 22 L162 46 L120 70 Z",
      "M70 22 L80 70 L38 46 Z",
      "M100 2 L114 26 L100 42 L86 26 Z",
    ],
    shards: [
      "M16 86 L-10 122 L26 146 Z",
      "M184 86 L210 122 L174 146 Z",
      "M82 202 L100 242 L118 202 Z",
      "M52 158 L26 182 L68 190 Z",
      "M148 158 L174 182 L132 190 Z",
      "M100 24 L120 50 L100 68 L80 50 Z",
    ],
    highlights: [
      "M100 8 L134 32 L108 76 Z",
      "M64 102 L92 126 L70 150 Z",
      "M118 76 L146 104 L120 140 Z",
      "M90 116 L110 116 L100 140 Z",
    ],
    sparkles: [
      { x: 18, y: 28, r: 2.2, twinkle: true },
      { x: 182, y: 30, r: 1.7 },
      { x: 2, y: 118, r: 1.5 },
      { x: 200, y: 122, r: 1.6, twinkle: true },
      { x: 28, y: 194, r: 1.3 },
      { x: 172, y: 202, r: 1.3 },
      { x: 100, y: 10, r: 1.2 },
      { x: 74, y: 6, r: 1.0 },
      { x: 126, y: 6, r: 1.0 },
      { x: 100, y: 216, r: 1.1 },
    ],
    glow: 0.26,
  },
  4: {
    core: "M100 0 L132 18 L168 54 L186 110 L164 188 L132 226 L100 244 L68 226 L36 188 L14 110 L32 54 L68 18 Z",
    inner: "M100 48 L132 78 L150 118 L134 162 L114 194 L100 208 L86 194 L66 162 L50 118 L68 78 Z",
    backFacets: [
      "M100 0 L132 18 L100 40 Z",
      "M68 18 L100 40 L100 0 Z",
      "M14 110 L36 188 L32 54 Z",
      "M186 110 L168 54 L164 188 Z",
      "M132 226 L100 244 L116 210 Z",
      "M68 226 L84 210 L100 244 Z",
    ],
    frontFacets: [
      "M132 18 L168 54 L122 84 Z",
      "M32 54 L78 84 L68 18 Z",
      "M168 54 L186 110 L136 120 Z",
      "M14 110 L64 120 L32 54 Z",
      "M186 110 L164 188 L124 156 Z",
      "M36 188 L76 156 L14 110 Z",
      "M76 156 L100 182 L124 156 Z",
      "M100 82 L126 98 L100 118 L74 98 Z",
      "M92 134 L108 134 L100 156 Z",
    ],
    crown: [
      "M100 0 L132 18 L100 32 Z",
      "M68 18 L100 32 L100 0 Z",
      "M132 18 L168 46 L120 70 Z",
      "M68 18 L80 70 L32 46 Z",
      "M100 0 L118 24 L100 44 L82 24 Z",
      "M120 70 L150 88 L120 110 Z",
      "M80 70 L50 88 L80 110 Z",
    ],
    shards: [
      "M10 84 L-18 126 L24 150 Z",
      "M190 84 L218 126 L176 150 Z",
      "M80 204 L100 244 L120 204 Z",
      "M48 156 L18 186 L66 196 Z",
      "M152 156 L182 186 L134 196 Z",
      "M100 22 L124 50 L100 72 L76 50 Z",
      "M100 72 L126 102 L100 120 L74 102 Z",
    ],
    highlights: [
      "M100 6 L136 30 L108 78 Z",
      "M62 104 L92 128 L68 154 Z",
      "M120 78 L150 108 L122 146 Z",
      "M90 116 L110 116 L100 142 Z",
    ],
    sparkles: [
      { x: 16, y: 24, r: 2.3, twinkle: true },
      { x: 184, y: 26, r: 1.7 },
      { x: -2, y: 122, r: 1.6 },
      { x: 204, y: 126, r: 1.7, twinkle: true },
      { x: 20, y: 198, r: 1.4 },
      { x: 180, y: 206, r: 1.4 },
      { x: 100, y: 8, r: 1.2 },
      { x: 72, y: 2, r: 1.0 },
      { x: 128, y: 2, r: 1.0 },
      { x: 100, y: 220, r: 1.1 },
      { x: 40, y: 156, r: 1.1 },
      { x: 160, y: 156, r: 1.1 },
    ],
    glow: 0.29,
  },
  5: {
    core: "M100 -2 L134 16 L172 52 L194 110 L170 194 L136 232 L100 246 L64 232 L30 194 L6 110 L28 52 L66 16 Z",
    inner: "M100 46 L134 78 L154 120 L136 166 L114 200 L100 214 L86 200 L62 166 L46 120 L66 78 Z",
    backFacets: [
      "M100 -2 L134 16 L100 40 Z",
      "M66 16 L100 40 L100 -2 Z",
      "M6 110 L30 194 L28 52 Z",
      "M194 110 L172 52 L170 194 Z",
      "M136 232 L100 246 L118 210 Z",
      "M64 232 L82 210 L100 246 Z",
    ],
    frontFacets: [
      "M134 16 L172 52 L122 86 Z",
      "M28 52 L78 86 L66 16 Z",
      "M172 52 L194 110 L138 122 Z",
      "M6 110 L62 122 L28 52 Z",
      "M194 110 L170 194 L124 158 Z",
      "M30 194 L76 158 L6 110 Z",
      "M76 158 L100 186 L124 158 Z",
      "M100 82 L130 100 L100 122 L70 100 Z",
      "M92 136 L108 136 L100 162 Z",
    ],
    crown: [
      "M100 -2 L134 16 L100 32 Z",
      "M66 16 L100 32 L100 -2 Z",
      "M134 16 L172 46 L118 72 Z",
      "M66 16 L82 72 L28 46 Z",
      "M100 -2 L122 22 L100 44 L78 22 Z",
      "M118 72 L154 92 L120 118 Z",
      "M82 72 L46 92 L80 118 Z",
      "M150 92 L182 108 L148 130 Z",
      "M50 92 L18 108 L52 130 Z",
    ],
    shards: [
      "M2 78 L-26 130 L20 154 Z",
      "M198 78 L226 130 L180 154 Z",
      "M76 206 L100 246 L124 206 Z",
      "M44 156 L12 190 L66 200 Z",
      "M156 156 L188 190 L134 200 Z",
      "M100 20 L126 50 L100 74 L74 50 Z",
      "M100 70 L132 104 L100 124 L68 104 Z",
      "M40 120 L12 150 L54 160 Z",
      "M160 120 L188 150 L146 160 Z",
    ],
    highlights: [
      "M100 4 L138 30 L108 80 Z",
      "M60 106 L92 132 L66 158 Z",
      "M122 80 L156 112 L124 152 Z",
      "M90 118 L110 118 L100 144 Z",
      "M100 70 L122 90 L100 104 L78 90 Z",
    ],
    sparkles: [
      { x: 12, y: 18, r: 2.4, twinkle: true },
      { x: 188, y: 20, r: 1.8 },
      { x: -6, y: 126, r: 1.7 },
      { x: 210, y: 130, r: 1.8, twinkle: true },
      { x: 14, y: 200, r: 1.5 },
      { x: 186, y: 210, r: 1.5 },
      { x: 100, y: 6, r: 1.2 },
      { x: 70, y: 0, r: 1.0 },
      { x: 130, y: 0, r: 1.0 },
      { x: 100, y: 224, r: 1.2 },
      { x: 40, y: 160, r: 1.1 },
      { x: 160, y: 160, r: 1.1 },
      { x: 94, y: 196, r: 1.0 },
      { x: 106, y: 196, r: 1.0 },
    ],
    glow: 0.33,
  },
};

export function LoyaltyCrystal({ level, percent, size = 180 }: LoyaltyCrystalProps) {
  const uid = useId();
  const preset = PRESETS[level];

  const layers = useMemo(() => {
    const back = preset.backFacets.map((d) => <path key={`back-${d}`} d={d} className="loyalty-crystal__backFacet" />);
    const front = preset.frontFacets.map((d) => <path key={`front-${d}`} d={d} className="loyalty-crystal__frontFacet" />);
    const crown = preset.crown.map((d) => <path key={`crown-${d}`} d={d} className="loyalty-crystal__crown" />);
    const shards = preset.shards.map((d) => <path key={`shard-${d}`} d={d} className="loyalty-crystal__shard" />);
    const highlights = preset.highlights.map((d) => <path key={`hl-${d}`} d={d} className="loyalty-crystal__highlight" />);
    return { back, front, crown, shards, highlights };
  }, [preset]);

  return (
    <div
      className="loyalty-crystal"
      style={{
        ["--crystal-size" as any]: `${size}px`,
        ["--crystal-glow" as any]: preset.glow,
      }}
      data-level={level}
    >
      <svg className="loyalty-crystal__svg" viewBox="-30 -10 260 280" aria-hidden="true">
        <defs>
          <linearGradient id={`crystal-body-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="45%" stopColor="rgba(120,170,255,0.3)" />
            <stop offset="100%" stopColor="rgba(120,200,255,0.12)" />
          </linearGradient>
          <linearGradient id={`crystal-inner-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(120,180,255,0.08)" />
          </linearGradient>
          <linearGradient id={`crystal-shimmer-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.28)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id={`crystal-glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.25  0 0 0 0 0.55  0 0 0 0 1  0 0 0 0.85 0"
            />
          </filter>
          <filter id={`crystal-text-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(40,90,170,0.45)" />
          </filter>
          <filter id={`crystal-under-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" result="underBlur" />
          </filter>
          <clipPath id={`crystal-clip-${uid}`}>
            <path d={preset.core} />
          </clipPath>
        </defs>

        <g className="loyalty-crystal__sparkles">
          {preset.sparkles.map((s, idx) => (
            <circle
              key={`sparkle-${idx}`}
              className={s.twinkle ? "sparkle sparkle--twinkle" : "sparkle"}
              cx={s.x}
              cy={s.y}
              r={s.r}
            />
          ))}
        </g>

        <g filter={`url(#crystal-glow-${uid})`}>
          <path d={preset.core} className="loyalty-crystal__glow" />
        </g>

        <ellipse
          cx="100"
          cy="244"
          rx="48"
          ry="16"
          className="loyalty-crystal__underGlow"
          filter={`url(#crystal-under-${uid})`}
        />

        <path d={preset.core} fill={`url(#crystal-body-${uid})`} className="loyalty-crystal__shell" />
        <path d={preset.inner} fill={`url(#crystal-inner-${uid})`} className="loyalty-crystal__inner" />

        {layers.back}
        {layers.crown}
        {layers.front}
        {layers.shards}
        {layers.highlights}

        <g clipPath={`url(#crystal-clip-${uid})`} className="loyalty-crystal__shimmer">
          <rect x="-140" y="0" width="240" height="260" fill={`url(#crystal-shimmer-${uid})`} />
        </g>

        <text
          x="100"
          y="128"
          textAnchor="middle"
          dominantBaseline="middle"
          className="loyalty-crystal__text"
          filter={`url(#crystal-text-${uid})`}
        >
          {percent}%
        </text>
      </svg>
    </div>
  );
}

export default LoyaltyCrystal;
