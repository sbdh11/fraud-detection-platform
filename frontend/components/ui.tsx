"use client";

import { useEffect, useRef, useState } from "react";

// ----------------------------------------------------------------- hooks
export function useInterval(fn: () => void, ms: number, immediate = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (immediate) saved.current();
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, immediate]);
}

export function usePolling<T>(loader: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useRef(loader);
  load.current = loader;
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const d = await load.current();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
  return { data, error, loading };
}

// ----------------------------------------------------------------- format
export const fmt = {
  pct: (x: number | null | undefined, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`),
  num: (x: number | null | undefined, d = 0) =>
    x == null ? "—" : x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }),
  ms: (x: number | null | undefined) => (x == null ? "—" : `${x.toFixed(x < 10 ? 2 : 1)} ms`),
  prob: (x: number | null | undefined) => (x == null ? "—" : x.toFixed(3)),
  time: (s: string) => {
    const d = new Date(s);
    return d.toLocaleTimeString(undefined, { hour12: false });
  },
  feature: (k: string) => k.replace(/_/g, " "),
};

// ----------------------------------------------------------------- atoms
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({
  title,
  right,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {typeof title === "string" ? <h2 className="text-sm font-semibold text-slate-200">{title}</h2> : title}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "brand";
}) {
  const toneCls = {
    default: "text-white",
    ok: "text-ok-400",
    warn: "text-warn-400",
    danger: "text-danger-400",
    brand: "text-brand-400",
  }[tone];
  return (
    <div className="card-tight">
      <div className="label">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular ${toneCls}`}>{value}</div>
      {hint != null && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "danger" | "brand";
}) {
  const map = {
    default: "bg-ink-700/60 text-slate-300",
    ok: "bg-ok-500/15 text-ok-400 ring-1 ring-ok-500/25",
    warn: "bg-warn-500/15 text-warn-400 ring-1 ring-warn-500/25",
    danger: "bg-danger-500/15 text-danger-400 ring-1 ring-danger-500/25",
    brand: "bg-brand-600/15 text-brand-400 ring-1 ring-brand-500/25",
  }[tone];
  return <span className={`pill ${map}`}>{children}</span>;
}

export function ProbBar({ p, threshold }: { p: number; threshold?: number }) {
  const pct = Math.max(0, Math.min(1, p)) * 100;
  const over = threshold != null && p >= threshold;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-700/70">
      <div
        className={`h-full rounded-full ${over ? "bg-danger-500" : "bg-brand-500"}`}
        style={{ width: `${pct}%` }}
      />
      {threshold != null && (
        <div
          className="absolute top-0 h-full w-px bg-slate-300/70"
          style={{ left: `${Math.min(100, threshold * 100)}%` }}
          title={`threshold ${threshold.toFixed(3)}`}
        />
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-brand-400" />
      {label ?? "loading…"}
    </div>
  );
}

export function ErrorNote({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
      {msg}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-slate-300"
      type="button"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-brand-600" : "bg-ink-600"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
