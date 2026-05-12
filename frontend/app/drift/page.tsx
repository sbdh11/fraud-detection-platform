"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, DriftSnapshot, SimState } from "@/lib/api";
import { CHART_COLORS, DualLine, PsiBars, PsiTimeline } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote, fmt, PageHeader, Spinner, Stat } from "@/components/widgets";

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

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const stress = async (fraud_rate: number) => {
    setBusy(true);
    try {
      setSim(await api.setSim({ fraud_rate }));
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
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

  const latest = snaps[snaps.length - 1] ?? null;
  const psiSeries = useMemo(() => snaps.map((s) => ({ t: s.ts, psi: s.overall_psi })), [snaps]);
  const rateSeries = useMemo(
    () => snaps.map((s) => ({ t: s.ts, reference: s.fraud_rate_reference, current: s.fraud_rate_current, alerted: s.pred_rate_current })),
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

  const psiTone = (v: number) => (v >= 0.2 ? "destructive" : v >= 0.1 ? "warning" : "success");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drift Monitoring"
        subtitle="Population Stability Index on engineered features, plus fraud-rate and score-distribution shifts vs the reference (deploy-time) window."
        right={
          <div className="flex flex-wrap items-center gap-3">
            {sim && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>sim fraud rate {fmt.pct(sim.fraud_rate, 1)}</span>
                <Button variant="outline" size="sm" onClick={() => stress(0.12)} disabled={busy} title="raise the simulator's fraud rate to push the live distribution">
                  stress test
                </Button>
                <Button variant="ghost" size="sm" onClick={() => stress(0.018)} disabled={busy}>
                  reset
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={runNow} disabled={busy}>
              Run drift check
            </Button>
            {latest && <Badge variant={latest.drift_flag ? "destructive" : "success"}>{latest.drift_flag ? "DRIFT DETECTED" : "stable"}</Badge>}
          </div>
        }
      />
      {err && <ErrorNote msg={err} />}

      {!latest ? (
        <Card>
          <CardContent className="pt-5">
            <Spinner label="no drift snapshot yet: the worker writes one every ~30 s, or click “Run drift check”." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Overall PSI" value={latest.overall_psi.toFixed(3)} tone={psiTone(latest.overall_psi)} hint=">0.2 = significant" />
            <Stat label="Fraud rate · ref" value={fmt.pct(latest.fraud_rate_reference, 2)} />
            <Stat
              label="Fraud rate · live"
              value={fmt.pct(latest.fraud_rate_current, 2)}
              tone={Math.abs(latest.fraud_rate_current - latest.fraud_rate_reference) > 0.02 ? "warning" : "default"}
            />
            <Stat label="Mean score · ref" value={latest.mean_score_reference.toFixed(3)} />
            <Stat
              label="Mean score · live"
              value={latest.mean_score_current.toFixed(3)}
              tone={Math.abs(latest.mean_score_current - latest.mean_score_reference) > 0.1 ? "warning" : "default"}
            />
            <Stat label="Window" value={fmt.num(latest.n_current)} hint={`ref ${fmt.num(latest.n_reference)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Overall PSI over time</CardTitle></CardHeader>
              <CardContent><PsiTimeline data={psiSeries} /></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Fraud rate: reference vs live</CardTitle></CardHeader>
              <CardContent>
                <DualLine
                  data={rateSeries}
                  asPercent
                  keys={[
                    { key: "reference", color: CHART_COLORS.axis, name: "reference", dashed: true },
                    { key: "current", color: CHART_COLORS.red, name: "live (actual)" },
                    { key: "alerted", color: CHART_COLORS.teal, name: "alert rate" },
                  ]}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">dashed = deploy-time reference · red = actual live fraud rate · teal = model alert rate</p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Per-feature PSI · latest window</CardTitle></CardHeader>
              <CardContent>
                <PsiBars items={psiItems} />
                <p className="mt-2 text-[11px] text-muted-foreground">Bars past the amber line (0.1) = moderate drift; past the red line (0.2) = significant drift.</p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Mean model score: reference vs live</CardTitle></CardHeader>
              <CardContent>
                <DualLine
                  data={scoreSeries}
                  height={200}
                  keys={[
                    { key: "reference", color: CHART_COLORS.axis, name: "reference", dashed: true },
                    { key: "current", color: CHART_COLORS.indigo, name: "live" },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
