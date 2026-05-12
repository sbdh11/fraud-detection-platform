"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, DriftSnapshot, SimState } from "@/lib/api";
import { PsiBars } from "@/components/Charts";
import { Badge, Card, ErrorNote, fmt, PageHeader, Spinner, Stat } from "@/components/ui";

const AXIS = { stroke: "#5b6577", fontSize: 11 };
const GRID = "#1c2540";
const box = { background: "#0f1526", border: "1px solid #27324f", borderRadius: 10, fontSize: 12, color: "#e6edf6" } as const;
const tFmt = (s: string) => new Date(s).toLocaleTimeString(undefined, { hour12: false }).slice(0, 5);

export default function DriftPage() {
  const [snaps, setSnaps] = useState<DriftSnapshot[]>([]);
  const [sim, setSim] = useState<SimState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, sm] = await Promise.all([api.drift(120), api.sim().catch(() => null)]);
      setSnaps(s);
      if (sm) setSim(sm);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);

  const stress = async (fraud_rate: number) => {
    setBusy(true);
    try {
      const sm = await api.setSim({ fraud_rate });
      setSim(sm);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const latest = snaps[snaps.length - 1] ?? null;

  const psiSeries = useMemo(
    () => snaps.map((s) => ({ t: s.ts, psi: s.overall_psi, flag: s.drift_flag ? s.overall_psi : null })),
    [snaps],
  );
  const rateSeries = useMemo(
    () => snaps.map((s) => ({ t: s.ts, reference: s.fraud_rate_reference, current: s.fraud_rate_current, predicted: s.pred_rate_current })),
    [snaps],
  );
  const scoreSeries = useMemo(
    () => snaps.map((s) => ({ t: s.ts, reference: s.mean_score_reference, current: s.mean_score_current })),
    [snaps],
  );
  const psiItems = useMemo(
    () => (latest ? Object.entries(latest.feature_psi).map(([feature, psi]) => ({ feature, psi: Number(psi) })) : []),
    [latest],
  );

  const runNow = async () => {
    setBusy(true);
    try {
      await api.runDrift();
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drift Monitoring"
        subtitle="Population Stability Index on engineered features, plus fraud-rate and score-distribution shifts vs the training distribution."
        right={
          <div className="flex flex-wrap items-center gap-3">
            {sim && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>sim fraud rate {fmt.pct(sim.fraud_rate, 1)}</span>
                <button className="btn" onClick={() => stress(0.12)} disabled={busy} title="raise the simulator's fraud rate to push the live distribution">
                  ⚡ stress test
                </button>
                <button className="btn" onClick={() => stress(0.018)} disabled={busy}>
                  reset
                </button>
              </div>
            )}
            <button className="btn" onClick={runNow} disabled={busy}>
              ⟳ Run drift check
            </button>
            {latest && <Badge tone={latest.drift_flag ? "danger" : "ok"}>{latest.drift_flag ? "DRIFT DETECTED" : "stable"}</Badge>}
          </div>
        }
      />
      {err && <ErrorNote msg={err} />}

      {!latest ? (
        <Card>
          <Spinner label="no drift snapshot yet — the worker writes one every ~30s, or click “Run drift check”." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Overall PSI" value={latest.overall_psi.toFixed(3)} tone={latest.overall_psi >= 0.2 ? "danger" : latest.overall_psi >= 0.1 ? "warn" : "ok"} hint=">0.2 = significant" />
            <Stat label="Fraud rate (ref)" value={fmt.pct(latest.fraud_rate_reference, 2)} />
            <Stat label="Fraud rate (live)" value={fmt.pct(latest.fraud_rate_current, 2)} tone={Math.abs(latest.fraud_rate_current - latest.fraud_rate_reference) > 0.02 ? "warn" : "default"} />
            <Stat label="Mean score (ref)" value={latest.mean_score_reference.toFixed(3)} />
            <Stat label="Mean score (live)" value={latest.mean_score_current.toFixed(3)} tone={Math.abs(latest.mean_score_current - latest.mean_score_reference) > 0.1 ? "warn" : "default"} />
            <Stat label="Window" value={fmt.num(latest.n_current)} hint={`ref ${fmt.num(latest.n_reference)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Overall PSI over time">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={psiSeries} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gPsi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="t" tickFormatter={tFmt} {...AXIS} minTickGap={28} />
                  <YAxis {...AXIS} width={44} />
                  <ReferenceLine y={0.1} stroke="#f59e0b" strokeDasharray="3 3" />
                  <ReferenceLine y={0.2} stroke="#f43f5e" strokeDasharray="3 3" />
                  <Tooltip contentStyle={box} labelFormatter={(s) => new Date(s as string).toLocaleTimeString()} formatter={(v: any) => [Number(v).toFixed(4), "PSI"]} />
                  <Area type="monotone" dataKey="psi" stroke="#fbbf24" fill="url(#gPsi)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Fraud rate: reference vs live">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rateSeries} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="t" tickFormatter={tFmt} {...AXIS} minTickGap={28} />
                  <YAxis {...AXIS} width={44} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip contentStyle={box} labelFormatter={(s) => new Date(s as string).toLocaleTimeString()} formatter={(v: any, n: any) => [`${(Number(v) * 100).toFixed(2)}%`, n]} />
                  <Line type="monotone" dataKey="reference" stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="current" stroke="#fb7185" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="predicted" stroke="#5eead4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[11px] text-slate-500">dashed = training reference · red = actual live fraud rate · teal = model alert rate</p>
            </Card>

            <Card title="Per-feature PSI (latest window)" className="lg:col-span-2">
              <PsiBars items={psiItems} />
              <p className="mt-2 text-[11px] text-slate-500">Bars beyond the amber line (0.1) indicate moderate drift; beyond the red line (0.2), significant drift.</p>
            </Card>

            <Card title="Mean model score: reference vs live" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={scoreSeries} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="t" tickFormatter={tFmt} {...AXIS} minTickGap={28} />
                  <YAxis {...AXIS} width={44} domain={[0, "auto"]} />
                  <Tooltip contentStyle={box} labelFormatter={(s) => new Date(s as string).toLocaleTimeString()} formatter={(v: any, n: any) => [Number(v).toFixed(4), n]} />
                  <Line type="monotone" dataKey="reference" stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="current" stroke="#a5b4fc" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
