"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { api, DashboardSummary, FeedRow, TimeseriesPoint } from "@/lib/api";
import { FraudRateChart, LatencyChart, ScoreDistChart, VolumeChart } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardSkeleton, ErrorNote, fmt, Note, PageHeader, ProbBar, Spinner, Stat } from "@/components/widgets";

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
      const [s, ts, f, a] = await Promise.all([api.summary(), api.timeseries(30, 30), api.feed(40), api.feed(12, true)]);
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
      setTrainMsg("Training started — models retrain on synthetic data and update in ~30–60 s.");
    } catch (e: any) {
      setTrainMsg(`Could not start training: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!summary) {
    return (
      <div>
        <PageHeader title="Live Fraud Dashboard" subtitle="Streaming transactions scored in real time" icon={<LayoutDashboard className="size-5" />} />
        {err ? <ErrorNote msg={err} /> : <Spinner label="connecting to API…" />}
      </div>
    );
  }

  const driftVariant = summary.last_drift_flag ? "destructive" : summary.last_drift_psi != null ? "success" : "outline";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Fraud Dashboard"
        subtitle="Synthetic financial transactions stream in and are scored by the active model in real time."
        icon={<LayoutDashboard className="size-5" />}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={summary.simulation_running} onCheckedChange={toggleSim} />
              {summary.simulation_running ? "Simulation on" : "Simulation off"}
            </div>
            <Button variant="outline" size="sm" onClick={retrain} disabled={busy}>
              <RefreshCw className="size-3.5" /> Retrain models
            </Button>
            <Badge variant={summary.active_model ? "primary" : "warning"}>
              {summary.active_model ? `model: ${summary.active_model}` : "no model"}
            </Badge>
          </div>
        }
      />

      {err && <ErrorNote msg={err} />}
      {trainMsg && <Note>{trainMsg}</Note>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Transactions" value={fmt.num(summary.total_transactions)} hint="processed" icon={<Activity className="size-4" />} />
        <Stat label="Predictions" value={fmt.num(summary.total_predictions)} icon={<Target className="size-4" />} />
        <Stat
          label="Fraud alerts"
          value={fmt.num(summary.fraud_alerts)}
          tone="destructive"
          hint={`${fmt.pct(summary.fraud_rate, 2)} of predictions`}
          icon={<AlertTriangle className="size-4" />}
        />
        <Stat
          label="Inference latency"
          value={fmt.ms(summary.avg_latency_ms)}
          hint={`p95 ${fmt.ms(summary.p95_latency_ms)}`}
          tone="primary"
          icon={<Gauge className="size-4" />}
        />
        <Stat
          label="ROC-AUC"
          value={summary.roc_auc != null ? summary.roc_auc.toFixed(3) : "—"}
          hint={`threshold ${summary.threshold != null ? summary.threshold.toFixed(3) : "—"}`}
          icon={<ShieldCheck className="size-4" />}
        />
        <Stat
          label="Precision / Recall"
          value={`${fmt.pct(summary.precision ?? null, 0)} / ${fmt.pct(summary.recall ?? null, 0)}`}
          hint="on labelled stream"
          icon={<CircleDollarSign className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Fraud rate · last 30 min</CardTitle>
            <Badge variant={driftVariant}>
              {summary.last_drift_psi != null ? `drift PSI ${summary.last_drift_psi.toFixed(3)}` : "drift: n/a"}
            </Badge>
          </CardHeader>
          <CardContent>
            <FraudRateChart data={series.map((p) => ({ t: p.t, fraud_rate: p.fraud_rate, count: p.count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Transaction volume &amp; alerts</CardTitle></CardHeader>
          <CardContent>
            <VolumeChart data={series.map((p) => ({ t: p.t, count: p.count, fraud_count: p.fraud_count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Inference latency (ms)</CardTitle></CardHeader>
          <CardContent><LatencyChart data={series.map((p) => ({ t: p.t, avg_latency_ms: p.avg_latency_ms }))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mean fraud score · model confidence</CardTitle></CardHeader>
          <CardContent><ScoreDistChart data={series.map((p) => ({ t: p.t, mean_score: p.mean_score }))} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Live transaction feed</CardTitle>
            <Badge variant="outline">{feed.length} recent</Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-[460px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-44">Fraud probability</TableHead>
                    <TableHead>Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feed.map((p) => (
                    <TableRow key={p.prediction_id} className={p.predicted_fraud ? "bg-destructive/[0.05]" : undefined}>
                      <TableCell className="tabular text-muted-foreground">{fmt.time(p.ts)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.user_id}</TableCell>
                      <TableCell className="capitalize">{p.merchant_type}</TableCell>
                      <TableCell className="text-muted-foreground">{p.location}</TableCell>
                      <TableCell className="text-muted-foreground/70">{p.device_type}</TableCell>
                      <TableCell className="text-right tabular">${fmt.num(p.amount, 2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ProbBar p={p.fraud_probability} threshold={p.threshold} />
                          <span className="w-12 text-right text-xs tabular">{fmt.prob(p.fraud_probability)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.predicted_fraud ? <Badge variant="destructive">FRAUD</Badge> : <Badge variant="success">ok</Badge>}
                        {p.actual_fraud != null && p.actual_fraud !== p.predicted_fraud && (
                          <span className="ml-1 text-[10px] text-warning" title="model disagreed with the ground-truth label">⚑</span>
                        )}
                        <Link href={`/explainability?prediction=${p.prediction_id}`} className="ml-2 text-[11px] text-primary hover:underline">
                          why
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {feed.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground">waiting for transactions…</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Fraud alerts</CardTitle>
            <Badge variant="destructive">{alerts.length}</Badge>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <CardSkeleton rows={4} />
            ) : (
              <ul className="max-h-[460px] space-y-2 overflow-auto pr-1">
                {alerts.map((p) => (
                  <li key={p.prediction_id} className="rounded-lg border border-destructive/20 bg-destructive/[0.06] p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{p.user_id}</span>
                      <span className="tabular">{fmt.time(p.ts)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-sm text-destructive">
                        prob {fmt.prob(p.fraud_probability)} · ${fmt.num(p.amount, 2)} · <span className="capitalize">{p.merchant_type}</span>
                      </span>
                      <Link href={`/explainability?prediction=${p.prediction_id}`} className="shrink-0 text-xs text-primary hover:underline">
                        explain →
                      </Link>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground/80">
                      {p.top_factors.slice(0, 3).map((f) => `${fmt.feature(f.feature)} ${f.shap >= 0 ? "↑" : "↓"}`).join("   ·   ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
