"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const C = {
  teal: "hsl(var(--chart-1))",
  red: "hsl(var(--chart-2))",
  indigo: "hsl(var(--chart-3))",
  amber: "hsl(var(--chart-4))",
  sky: "hsl(var(--chart-5))",
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted-foreground))",
  neutral: "hsl(220 8% 40%)",
};
const AXIS = { stroke: C.axis, fontSize: 11 } as const;

// dark-themed tooltip + hover cursors (Recharts' defaults are light)
const TT = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    fontSize: 12,
    padding: "6px 10px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
  } as React.CSSProperties,
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 2 } as React.CSSProperties,
  itemStyle: { color: "hsl(var(--popover-foreground))", padding: 0 } as React.CSSProperties,
};
const barCursor = { fill: "hsl(var(--muted))", fillOpacity: 0.45 };
const lineCursor = { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" };

const hm = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }).slice(0, 5);
const full = (s: string | number) => new Date(s as string).toLocaleTimeString();

export function FraudRateChart({ data }: { data: { t: string; fraud_rate: number; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gFraud" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.red} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.red} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tickFormatter={hm} {...AXIS} minTickGap={28} />
        <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} {...AXIS} width={42} />
        <Tooltip
          {...TT}
          cursor={lineCursor}
          labelFormatter={full}
          formatter={(v: any, n: any) => (n === "fraud_rate" ? [`${(v * 100).toFixed(2)}%`, "fraud rate"] : [v, n])}
        />
        <Area type="monotone" dataKey="fraud_rate" stroke={C.red} fill="url(#gFraud)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VolumeChart({ data }: { data: { t: string; count: number; fraud_count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tickFormatter={hm} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={36} allowDecimals={false} />
        <Tooltip {...TT} cursor={barCursor} labelFormatter={full} />
        <Bar dataKey="count" fill={C.teal} radius={[2, 2, 0, 0]} name="transactions" />
        <Bar dataKey="fraud_count" fill={C.red} radius={[2, 2, 0, 0]} name="fraud alerts" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ data }: { data: { t: string; avg_latency_ms: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tickFormatter={hm} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={42} />
        <Tooltip {...TT} cursor={lineCursor} labelFormatter={full} formatter={(v: any) => [`${Number(v).toFixed(2)} ms`, "avg latency"]} />
        <Line type="monotone" dataKey="avg_latency_ms" stroke={C.teal} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScoreDistChart({ data }: { data: { t: string; mean_score: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.indigo} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tickFormatter={hm} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={42} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip {...TT} cursor={lineCursor} labelFormatter={full} formatter={(v: any) => [Number(v).toFixed(3), "mean fraud score"]} />
        <Area type="monotone" dataKey="mean_score" stroke={C.indigo} fill="url(#gScore)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FeatureImportanceChart({ items }: { items: { feature: string; importance: number }[] }) {
  const data = items.map((d) => ({ ...d, label: d.feature.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <Tooltip {...TT} cursor={barCursor} formatter={(v: any) => [`${(v * 100).toFixed(2)}%`, "importance"]} />
        <Bar dataKey="importance" fill={C.teal} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ShapBars({ contributions }: { contributions: { feature: string; value: number; shap: number }[] }) {
  const data = contributions
    .slice()
    .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
    .slice(0, 12)
    .map((d) => ({ ...d, label: d.feature.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <ReferenceLine x={0} stroke={C.axis} />
        <Tooltip
          {...TT}
          cursor={barCursor}
          formatter={(v: any, _n: any, p: any) => [
            `${Number(v).toFixed(4)}  (value ${Number(p?.payload?.value).toFixed(3)})`,
            "SHAP",
          ]}
        />
        <Bar dataKey="shap" radius={[2, 2, 2, 2]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.shap >= 0 ? C.red : C.teal} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PsiBars({
  items,
  alert = 0.2,
  warn = 0.1,
}: {
  items: { feature: string; psi: number }[];
  alert?: number;
  warn?: number;
}) {
  const data = items
    .slice()
    .sort((a, b) => b.psi - a.psi)
    .map((d) => ({ ...d, label: d.feature.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <ReferenceLine x={warn} stroke={C.amber} strokeDasharray="3 3" />
        <ReferenceLine x={alert} stroke={C.red} strokeDasharray="3 3" />
        <Tooltip {...TT} cursor={barCursor} formatter={(v: any) => [Number(v).toFixed(4), "PSI"]} />
        <Bar dataKey="psi" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.psi >= alert ? C.red : d.psi >= warn ? C.amber : C.teal} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ModelMetricBars({
  models,
  label,
}: {
  models: { model_name: string; value: number; active: boolean }[];
  label: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={models} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="model_name" {...AXIS} />
        <YAxis {...AXIS} width={44} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip {...TT} cursor={barCursor} formatter={(v: any) => [Number(v).toFixed(4), label]} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} name={label}>
          {models.map((m, i) => (
            <Cell key={i} fill={m.active ? C.teal : C.neutral} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// drift-page timelines
export function PsiTimeline({ data }: { data: { t: string; psi: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gPsi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.amber} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.amber} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tickFormatter={hm} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={44} />
        <ReferenceLine y={0.1} stroke={C.amber} strokeDasharray="3 3" />
        <ReferenceLine y={0.2} stroke={C.red} strokeDasharray="3 3" />
        <Tooltip {...TT} cursor={lineCursor} labelFormatter={full} formatter={(v: any) => [Number(v).toFixed(4), "PSI"]} />
        <Area type="monotone" dataKey="psi" stroke={C.amber} fill="url(#gPsi)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DualLine({
  data,
  keys,
  asPercent = false,
  height = 220,
}: {
  data: any[];
  keys: { key: string; color: string; name: string; dashed?: boolean }[];
  asPercent?: boolean;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="t" tickFormatter={hm} {...AXIS} minTickGap={28} />
        <YAxis
          {...AXIS}
          width={44}
          tickFormatter={asPercent ? (v) => `${(v * 100).toFixed(0)}%` : undefined}
          domain={asPercent ? undefined : [0, "auto"]}
        />
        <Tooltip
          {...TT}
          cursor={lineCursor}
          labelFormatter={full}
          formatter={(v: any, n: any) => [asPercent ? `${(Number(v) * 100).toFixed(2)}%` : Number(v).toFixed(4), n]}
        />
        {keys.map((k) => (
          <Line
            key={k.key}
            type="monotone"
            dataKey={k.key}
            name={k.name}
            stroke={k.color}
            strokeWidth={2}
            dot={false}
            strokeDasharray={k.dashed ? "4 3" : undefined}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export const CHART_COLORS = C;
