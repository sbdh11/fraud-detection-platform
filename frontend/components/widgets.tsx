"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  time: (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }),
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const TONE = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;
type Tone = keyof typeof TONE;

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-[22px] font-semibold leading-tight tabular", TONE[tone])}>{value}</div>
      {hint != null && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ProbBar({ p, threshold }: { p: number; threshold?: number }) {
  const pct = Math.max(0, Math.min(1, p)) * 100;
  const over = threshold != null && p >= threshold;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
      {threshold != null && (
        <div
          className="absolute top-0 h-full w-px bg-foreground/60"
          style={{ left: `${Math.min(100, threshold * 100)}%` }}
          title={`threshold ${threshold.toFixed(3)}`}
        />
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="size-3.5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      {label ?? "loading…"}
    </div>
  );
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

export function ErrorNote({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {msg}
    </div>
  );
}

export function Note({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "warning" }) {
  const cls =
    tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-primary/30 bg-primary/10 text-primary";
  return <div className={cn("rounded-lg border px-3 py-2 text-sm", cls)}>{children}</div>;
}
