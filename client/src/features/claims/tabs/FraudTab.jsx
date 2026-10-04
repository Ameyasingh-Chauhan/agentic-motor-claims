import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, CircleCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { RiskGauge } from "../../../components/ui/RiskGauge";
import { StatusFlag, ClaimStatusBadge } from "../../../components/ui/StatusFlag";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Collapsible } from "../../../components/ui/Collapsible";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LazyEChart } from "../../../components/charts/LazyEChart";

const REF_TARGET = {
  "checks.fastag": ["verification", "check-fastag", "FASTag check"], "checks.vahan": ["verification", "check-vahan", "Vahan check"],
  "checks.dl": ["verification", "check-dl", "Driving licence check"], "checks.iib": ["verification", "check-iib", "IIB history"],
  "checks.police": ["verification", "check-police", "Police records"], "checks.policy": ["verification", "check-policy", "Policy check"],
  "damage.pre_existing": ["damage", null, "Pre-existing damage photo"], "damage.narrative_consistency": ["damage", "narrative", "Narrative check"],
  "financials.variance": ["financials", "variance", "Garage quote variance"], "media.exif": ["damage", null, "Photo metadata"],
  "vehicle_identity": ["damage", null, "Vehicle identity"], "vehicle_identity.cross_photo": ["damage", null, "Vehicle identity"],
};

function Waterfall({ fired, score }) {
  const option = useMemo(() => (t) => {
    let run = 0;
    const base = [], value = [];
    for (const r of fired) { base.push(run); value.push(r.points); run += r.points; }
    const labels = [...fired.map((r) => r.rule_id), "Score"];
    return {
      grid: { left: 40, right: 16, top: 24, bottom: 36 },
      legend: { show: false },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (ps) => { const p = ps.find((x) => x.seriesName === "points"); const r = fired[p.dataIndex];
          return r ? `<b>${r.rule_id}</b> ${r.name}<br/>+${r.points} points` : `<b>Total score</b> ${score}`; } },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value", max: Math.max(100, score), name: "points" },
      series: [
        { name: "base", type: "bar", stack: "w", silent: true, itemStyle: { color: "transparent" }, data: [...base, 0] },
        { name: "points", type: "bar", stack: "w", barMaxWidth: 40,
          data: [...value.map((v, i) => ({ value: v, itemStyle: { color: fired[i].level === "fail" ? t.danger : t.warning, borderRadius: 4 } })),
            { value: score, itemStyle: { color: t.text, borderRadius: 4 } }],
          label: { show: true, position: "top", color: t.text, fontSize: 12, formatter: (p) => (p.dataIndex < fired.length ? `+${p.value}` : `${p.value}`) } },
      ],
    };
  }, [fired, score]);
  return <LazyEChart option={option} className="h-64" ariaLabel={`Why this score: ${fired.map((r) => `${r.rule_id} plus ${r.points}`).join(", ")}, total ${score}`} />;
}

function RunningTable({ fired, score }) {
  let run = 0;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-caption text-muted"><tr className="border-b border-border">
        {["Rule", "Name", "Points", "Running total"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
      </tr></thead>
      <tbody>
        {fired.map((r) => { run += r.points; return (
          <tr key={r.rule_id} className="border-b border-border"><td className="mono px-2 py-2 text-text">{r.rule_id}</td><td className="px-2 py-2 text-text">{r.name}</td>
            <td className="num px-2 py-2 text-text">+{r.points}</td><td className="num px-2 py-2 text-text">{run}</td></tr>); })}
        <tr><td className="px-2 py-2 font-semibold text-text" colSpan={3}>Score (capped at 100)</td><td className="num px-2 py-2 font-semibold text-text">{score}</td></tr>
      </tbody>
    </table>
  );
}

function Network({ net, claim }) {
  const option = useMemo(() => (t) => ({
    tooltip: { formatter: (p) => p.data.tip ?? p.data.name },
    series: [{
      type: "graph", layout: "force", roam: false, force: { repulsion: 220, edgeLength: 90 }, label: { show: true, color: t.text, fontSize: 12 },
      data: [
        { name: claim.id, symbolSize: 34, itemStyle: { color: t.danger }, tip: `${claim.id} (this claim)` },
        { name: net.shared.garage, symbolSize: 26, symbol: "roundRect", itemStyle: { color: t.palette[0] }, tip: `Shared garage: ${net.shared.garage}` },
        ...net.claims.map((c) => ({ name: c.id, symbolSize: 22, itemStyle: { color: t.warning }, tip: `${c.id} · ${c.customer_name} · risk ${c.risk_score}` })),
      ],
      links: [{ source: claim.id, target: net.shared.garage }, ...net.claims.map((c) => ({ source: c.id, target: net.shared.garage }))],
      lineStyle: { color: t.border, width: 2 },
    }],
  }), [net, claim.id]);
  return (
    <Card compact title="Linked claims network" subtitle={`${net.claims.length} other claim(s) share ${net.shared.garage}`}>
      <LazyEChart option={option} className="h-72" ariaLabel={`Network: ${net.claims.length} claims linked through the garage ${net.shared.garage}`} />
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {net.claims.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <Link to={`/claims/${c.id}`} className="mono text-blue-600 hover:underline">{c.id}</Link>
            <span className="text-muted">{c.customer_name}</span><ClaimStatusBadge status={c.status} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Fraud Analysis tab (§10.4 C5). */
export function FraudTab({ claim, onEvidence }) {
  const fraud = claim.fraud;
  const [view, setView] = useState("chart");
  if (!fraud) return <EmptyState title="Risk scoring pending" description="The Fraud agent scores the claim against the DMN rules when the pipeline runs." />;
  const fired = [...fraud.fired].sort((a, b) => b.points - a.points);
  const names = claim.context?.rule_names ?? {};
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <Card compact className="flex flex-col items-center justify-center">
          <RiskGauge score={fraud.score} />
          {fraud.hard_stop && <StatusFlag className="mt-2" level="fail" label="Hard stop — SIU mandatory" />}
        </Card>
        <Card compact title="Why this score" subtitle="Each fired rule's points stack to the total"
          actions={fired.length ? <SegmentedControl size="sm" label="Score view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} /> : null}>
          {fired.length ? (view === "chart" ? <Waterfall fired={fired} score={fraud.score} /> : <RunningTable fired={fired} score={fraud.score} />)
            : <p className="inline-flex items-center gap-2 text-sm text-success"><CircleCheck size={16} aria-hidden="true" />No rule fired — score {fraud.score}.</p>}
        </Card>
      </div>

      {claim.ai_sources && fraud.narrative && (
        <Card compact title="Investigator summary" subtitle="Written by the Fraud agent — it explains the score; it cannot change it">
          <p className="text-sm text-text">{fraud.narrative}</p>
          {fraud.next_steps?.length > 0 && (
            <>
              <h3 className="mt-3 text-sm font-semibold text-text">Suggested next steps</h3>
              <ol className="mt-1 list-decimal pl-5 text-sm text-text">{fraud.next_steps.map((s) => <li key={s}>{s}</li>)}</ol>
            </>
          )}
          {fraud.extra_observations?.length > 0 && (
            <>
              <h3 className="mt-3 text-sm font-semibold text-text">Other observations (no points)</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-text">{fraud.extra_observations.map((o) => <li key={o.text}>{o.text} <span className="text-caption text-muted">({o.evidence} · {Math.round(o.confidence * 100)}%)</span></li>)}</ul>
            </>
          )}
        </Card>
      )}

      {fired.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {fired.map((r) => (
            <article key={r.rule_id} id={`rule-${r.rule_id}`} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-text"><span className="mono text-muted">{r.rule_id}</span> · {r.name}</h3>
                <span className="num shrink-0 text-lg font-semibold text-text">+{r.points}</span>
              </div>
              <StatusFlag size="sm" level={r.level} label={r.level === "fail" ? "Critical" : "Warning"} className="self-start" />
              <p className="text-sm text-text">{r.evidence}</p>
              {r.why && <p className="text-sm text-muted"><span className="font-medium text-text">Why it matters:</span> {r.why}</p>}
              <p className="text-caption text-muted">Confidence {Math.round((r.confidence ?? 0.9) * 100)}%</p>
              <div className="mt-auto flex flex-wrap gap-3">
                {(r.evidence_refs ?? []).map((ref) => {
                  const [tab, target, label] = REF_TARGET[ref] ?? [];
                  return tab ? (
                    <button key={ref} type="button" onClick={() => onEvidence(tab, target)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                      {label} <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  ) : null;
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface px-4">
        <Collapsible title={<span className="inline-flex items-center gap-2 text-sm font-semibold text-text"><CircleCheck size={16} className="text-success" aria-hidden="true" />
          {fraud.not_fired.length} rules evaluated and not fired</span>} headerClassName="px-0" contentClassName="px-0 pb-4">
          <ul className="grid gap-1 text-sm md:grid-cols-2">
            {fraud.not_fired.map((id) => (
              <li key={id} className="inline-flex items-center gap-2 text-text"><CircleCheck size={14} className="text-success" aria-hidden="true" />
                <span className="mono text-muted">{id}</span> {names[id] ?? ""}</li>
            ))}
          </ul>
        </Collapsible>
      </div>

      {claim.context?.network && <Network net={claim.context.network} claim={claim} />}
    </div>
  );
}
