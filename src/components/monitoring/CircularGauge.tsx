import type { LucideIcon } from "lucide-react";
import type { Band } from "@/lib/gauge-settings";
import { colorFor } from "@/lib/gauge-settings";

interface Props {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  size?: number;
  bands?: Band[];
  icon?: LucideIcon;
}

const FALLBACK_BANDS: Band[] = [
  { max: 60, color: "#22d3ee" },
  { max: 75, color: "#facc15" },
  { max: 100, color: "#ef4444" },
];

export function CircularGauge({
  value,
  max = 100,
  label,
  unit = "°",
  size = 64,
  bands,
  icon: Icon,
}: Props) {
  const pct = Math.max(0, Math.min(1, value / max));
  const color = colorFor(bands ?? FALLBACK_BANDS, value);
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="oklch(0.3 0.04 260 / 0.6)"
          strokeWidth={4}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            filter: `drop-shadow(0 0 6px ${color})`,
            transition: "stroke-dashoffset 600ms ease, stroke 300ms ease",
          }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
        {Icon && (
          <Icon
            size={Math.max(9, Math.round(size * 0.16))}
            color={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        )}
        <span
          className="font-mono font-bold leading-none"
          style={{ color, textShadow: `0 0 6px ${color}66`, fontSize: Math.max(12, Math.round(size * 0.24)) }}
        >
          {value.toFixed(0)}
          <span className="text-[8px] opacity-80">{unit}</span>
        </span>
        <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-foreground/70">
          {label}
        </span>
      </div>
    </div>
  );
}
