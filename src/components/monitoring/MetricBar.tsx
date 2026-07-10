import type { Band } from "@/lib/gauge-settings";
import { colorFor } from "@/lib/gauge-settings";

interface MetricBarProps {
  label: string;
  value: number;
  unit?: string;
  max?: number;
  thresholds?: { warn: number; crit: number };
  bands?: Band[];
}

export function MetricBar({
  label,
  value,
  unit = "%",
  max = 100,
  thresholds = { warn: 70, crit: 85 },
  bands,
}: MetricBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const color = bands
    ? colorFor(bands, value)
    : value >= thresholds.crit
      ? "var(--neon-red)"
      : value >= thresholds.warn
        ? "var(--neon-amber)"
        : "var(--neon-cyan)";

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground" style={{ color }}>
          {value.toFixed(unit === "GB" ? 1 : 0)}
          {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color})`,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
    </div>
  );
}
