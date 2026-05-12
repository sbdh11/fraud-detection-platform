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

const AXIS = { stroke: "#5b6577", fontSize: 11 };
const GRID = "#1c2540";

function box(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: "#0f1526",
    border: "1px solid #27324f",
    borderRadius: 10,
    fontSize: 12,
    color: "#e6edf6",
    ...extra,
  };
}

export function FraudRateChart({
  data,
}: {
  data: { t: string; fraud_rate: number; count: number }[];
}) {
  const fmtT = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }).slice(0, 5);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gFraud" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtT} {...AXIS} minTickGap={28} />
        <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} {...AXIS} width={42} />
        <Tooltip
          contentStyle={box()}
          labelFormatter={(s) => new Date(s as string).toLocaleTimeString()}
          formatter={(v: any, n: any) =>
            n === "fraud_rate" ? [`${(v * 100).toFixed(2)}%`, "fraud rate"] : [v, n]
          }
        />
        <Area type="monotone" dataKey="fraud_rate" stroke="#fb7185" fill="url(#gFraud)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VolumeChart({ data }: { data: { t: string; count: number; fraud_count: number }[] }) {
  const fmtT = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }).slice(0, 5);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtT} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={36} allowDecimals={false} />
        <Tooltip contentStyle={box()} labelFormatter={(s) => new Date(s as string).toLocaleTimeString()} />
        <Bar dataKey="count" stackId="a" fill="#2dd4bf" radius={[2, 2, 0, 0]} name="transactions" />
        <Bar dataKey="fraud_count" stackId="b" fill="#f43f5e" radius={[2, 2, 0, 0]} name="fraud alerts" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ data }: { data: { t: string; avg_latency_ms: number }[] }) {
  const fmtT = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }).slice(0, 5);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtT} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={42} tickFormatter={(v) => `${v}`} />
        <Tooltip
          contentStyle={box()}
          labelFormatter={(s) => new Date(s as string).toLocaleTimeString()}
          formatter={(v: any) => [`${Number(v).toFixed(2)} ms`, "avg latency"]}
        />
        <Line type="monotone" dataKey="avg_latency_ms" stroke="#5eead4" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScoreDistChart({ data }: { data: { t: string; mean_score: number }[] }) {
  const fmtT = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }).slice(0, 5);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtT} {...AXIS} minTickGap={28} />
        <YAxis {...AXIS} width={42} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip
          contentStyle={box()}
          labelFormatter={(s) => new Date(s as string).toLocaleTimeString()}
          formatter={(v: any) => [Number(v).toFixed(3), "mean fraud score"]}
        />
        <Area type="monotone" dataKey="mean_score" stroke="#a5b4fc" fill="url(#gScore)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FeatureImportanceChart({
  items,
}: {
  items: { feature: string; importance: number }[];
}) {
  const data = items.map((d) => ({ ...d, label: d.feature.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <Tooltip contentStyle={box()} formatter={(v: any) => [`${(v * 100).toFixed(2)}%`, "importance"]} />
        <Bar dataKey="importance" fill="#2dd4bf" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ShapBars({
  contributions,
}: {
  contributions: { feature: string; value: number; shap: number }[];
}) {
  const data = contributions
    .slice()
    .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
    .slice(0, 12)
    .map((d) => ({ ...d, label: d.feature.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <ReferenceLine x={0} stroke="#5b6577" />
        <Tooltip
          contentStyle={box()}
          formatter={(v: any, _n: any, p: any) => [
            `${Number(v).toFixed(4)}  (value ${Number(p?.payload?.value).toFixed(3)})`,
            "SHAP",
          ]}
        />
        <Bar dataKey="shap" radius={[2, 2, 2, 2]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.shap >= 0 ? "#f43f5e" : "#2dd4bf"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PsiBars({ items, alert = 0.2, warn = 0.1 }: { items: { feature: string; psi: number }[]; alert?: number; warn?: number }) {
  const data = items
    .slice()
    .sort((a, b) => b.psi - a.psi)
    .map((d) => ({ ...d, label: d.feature.replace(/_/g, " ") }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <ReferenceLine x={warn} stroke="#f59e0b" strokeDasharray="3 3" />
        <ReferenceLine x={alert} stroke="#f43f5e" strokeDasharray="3 3" />
        <Tooltip contentStyle={box()} formatter={(v: any) => [Number(v).toFixed(4), "PSI"]} />
        <Bar dataKey="psi" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.psi >= alert ? "#f43f5e" : d.psi >= warn ? "#f59e0b" : "#2dd4bf"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MetricRadar() {
  return null; // (reserved)
}

export function ModelMetricBars({
  models,
  metric,
  label,
}: {
  models: { model_name: string; value: number; active: boolean }[];
  metric: string;
  label: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={models} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="model_name" {...AXIS} />
        <YAxis {...AXIS} width={44} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip contentStyle={box()} formatter={(v: any) => [Number(v).toFixed(4), label]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} name={metric}>
          {models.map((m, i) => (
            <Cell key={i} fill={m.active ? "#2dd4bf" : "#3b82f6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
