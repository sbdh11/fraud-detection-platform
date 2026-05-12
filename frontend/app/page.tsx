"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, DashboardSummary, FeedRow, TimeseriesPoint } from "@/lib/api";
import { FraudRateChart, LatencyChart, ScoreDistChart, VolumeChart } from "@/components/Charts";
import { Badge, Card, ErrorNote, fmt, PageHeader, ProbBar, Spinner, Stat, Toggle } from "@/components/ui";

const REFRESH_MS = 2500;

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [alerts, setAlerts] = useState<FeedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, ts, f, a] = await Promise.all([
        api.summary(),
        api.timeseries(30, 30),
        api.feed(40),
        api.feed(12, true),
      ]);
      setSummary(s);
      setSeries(ts.series);
      setFeed(f);
      setAlerts(a);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const toggleSim = async (running: boolean) => {
    setBusy(true);
    try {
      await api.setSim({ running });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const retrain = async () => {
    setBusy(true);
    setTrainMsg(null);
    try {
      await api.train();
      setTrainMsg("Training started — models retrain on synthetic data and update in ~30–60s.");
    } catch (e: any) {
      setTrainMsg(`Could not start training: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!summary) {
    return (
      <div>
        <PageHeader title="Live Fraud Dashboard" subtitle="Streaming transactions scored in real time" />
        {err ? <ErrorNote msg={err} /> : <Spinner label="connecting to API…" />}
      </div>
    );
  }

  const driftTone = summary.last_drift_flag ? "danger" : summary.last_drift_psi != null ? "ok" : "default";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Fraud Dashboard"
        subtitle="Synthetic financial transactions stream in and are scored by the active model in real time."
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Toggle
              checked={summary.simulation_running}
              onChange={toggleSim}
              label={summary.simulation_running ? "Simulation on" : "Simulation off"}
            />
            <button className="btn" onClick={retrain} disabled={busy}>
              ↻ Retrain models
            </button>
            <Badge tone={summary.active_model ? "brand" : "warn"}>
              {summary.active_model ? `model: ${summary.active_model}` : "no model"}
            </Badge>
          </div>
        }
      />

      {err && <ErrorNote msg={err} />}
      {trainMsg && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-600/10 px-3 py-2 text-sm text-brand-400">
          {trainMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Transactions" value={fmt.num(summary.total_transactions)} hint="processed" />
        <Stat label="Predictions" value={fmt.num(summary.total_predictions)} />
        <Stat
          label="Fraud alerts"
          value={fmt.num(summary.fraud_alerts)}
          tone="danger"
          hint={`${fmt.pct(summary.fraud_rate, 2)} of predictions`}
        />
        <Stat
          label="Inference latency"
          value={fmt.ms(summary.avg_latency_ms)}
          hint={`p95 ${fmt.ms(summary.p95_latency_ms)}`}
          tone="brand"
        />
        <Stat
          label="ROC-AUC"
          value={summary.roc_auc != null ? summary.roc_auc.toFixed(3) : "—"}
          hint={`threshold ${summary.threshold != null ? summary.threshold.toFixed(3) : "—"}`}
        />
        <Stat
          label="Precision / Recall"
          value={`${fmt.pct(summary.precision ?? null, 0)} / ${fmt.pct(summary.recall ?? null, 0)}`}
          hint="on labelled stream"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Fraud rate (last 30 min)"
          right={
            <Badge tone={driftTone}>
              {summary.last_drift_psi != null ? `drift PSI ${summary.last_drift_psi.toFixed(3)}` : "drift: n/a"}
            </Badge>
          }
        >
          <FraudRateChart data={series.map((p) => ({ t: p.t, fraud_rate: p.fraud_rate, count: p.count }))} />
        </Card>
        <Card title="Transaction volume & alerts">
          <VolumeChart data={series.map((p) => ({ t: p.t, count: p.count, fraud_count: p.fraud_count }))} />
        </Card>
        <Card title="Inference latency (ms)">
          <LatencyChart data={series.map((p) => ({ t: p.t, avg_latency_ms: p.avg_latency_ms }))} />
        </Card>
        <Card title="Mean fraud score (model confidence)">
          <ScoreDistChart data={series.map((p) => ({ t: p.t, mean_score: p.mean_score }))} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Live transaction feed" className="lg:col-span-2">
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-ink-850/95 text-left text-[11px] uppercase tracking-wider text-slate-500 backdrop-blur">
                <tr>
                  <th className="table-cell">Time</th>
                  <th className="table-cell">User</th>
                  <th className="table-cell">Merchant</th>
                  <th className="table-cell">Location</th>
                  <th className="table-cell">Device</th>
                  <th className="table-cell text-right">Amount</th>
                  <th className="table-cell w-44">Fraud probability</th>
                  <th className="table-cell">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/50">
                {feed.map((p) => (
                  <tr key={p.prediction_id} className={p.predicted_fraud ? "bg-danger-500/[0.05]" : "hover:bg-ink-800/40"}>
                    <td className="table-cell tabular text-slate-400">{fmt.time(p.ts)}</td>
                    <td className="table-cell font-mono text-xs text-slate-300">{p.user_id}</td>
                    <td className="table-cell capitalize text-slate-300">{p.merchant_type}</td>
                    <td className="table-cell text-slate-400">{p.location}</td>
                    <td className="table-cell text-slate-500">{p.device_type}</td>
                    <td className="table-cell text-right tabular">${fmt.num(p.amount, 2)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <ProbBar p={p.fraud_probability} threshold={p.threshold} />
                        <span className="w-12 text-right text-xs tabular text-slate-300">{fmt.prob(p.fraud_probability)}</span>
                      </div>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      {p.predicted_fraud ? <Badge tone="danger">FRAUD</Badge> : <Badge tone="ok">ok</Badge>}
                      {p.actual_fraud != null && p.actual_fraud !== p.predicted_fraud && (
                        <span className="ml-1 text-[10px] text-warn-400" title="model disagreed with the ground-truth label">⚑</span>
                      )}
                      {p.transaction_id != null && (
                        <Link href={`/explainability?prediction=${p.prediction_id}`} className="ml-2 text-[11px] text-brand-400 hover:underline">
                          why
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {feed.length === 0 && (
                  <tr>
                    <td className="table-cell text-slate-500" colSpan={8}>
                      waiting for transactions…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Fraud alerts" right={<Badge tone="danger">{alerts.length}</Badge>}>
          <ul className="max-h-[460px] space-y-2 overflow-auto pr-1">
            {alerts.map((p) => (
              <li key={p.prediction_id} className="rounded-lg border border-danger-500/20 bg-danger-500/[0.06] p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">{p.user_id}</span>
                  <span className="tabular">{fmt.time(p.ts)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm text-danger-400">
                    prob {fmt.prob(p.fraud_probability)} · ${fmt.num(p.amount, 2)} · <span className="capitalize">{p.merchant_type}</span>
                  </span>
                  <Link href={`/explainability?prediction=${p.prediction_id}`} className="text-xs text-brand-400 hover:underline">
                    explain →
                  </Link>
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-500">
                  {p.top_factors.slice(0, 3).map((f) => `${fmt.feature(f.feature)} ${f.shap >= 0 ? "↑" : "↓"}`).join("   ·   ")}
                </div>
              </li>
            ))}
            {alerts.length === 0 && <li className="text-sm text-slate-500">no alerts yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
