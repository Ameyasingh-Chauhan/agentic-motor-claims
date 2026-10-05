import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { ClipboardList, IndianRupee, Scale, ShieldAlert, Timer, Zap } from "lucide-react";
import { KpiCard } from "../../components/ui/KpiCard";
import { Sparkline } from "../../components/ui/Sparkline";
import { formatDate, formatDateTime, formatHours, formatINRShort, formatNumber } from "../../lib/format";
import { firstVisit } from "../../lib/motion";
import { ChartCard } from "./ChartCard";
import { FilterBar } from "./FilterBar";
import { GarageLeaderboard } from "./GarageLeaderboard";
import { LegendList } from "./LegendList";
import { sectionVariants } from "./motion";
import { drillHref, useDashboard, useDashboardFilters } from "./useDashboard";
import * as C from "./charts";
import "./dashboard.css";

const KPI = {
  claims: { icon: ClipboardList, tone: "blue", fmt: (v) => formatNumber(Math.round(v)) },
  approved: { icon: IndianRupee, tone: "navy", fmt: formatINRShort },
  avg_claim: { icon: Scale, tone: "orange", fmt: formatINRShort },
  fraud_rate: { icon: ShieldAlert, tone: "red", fmt: (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%` },
  stp_rate: { icon: Zap, tone: "blue", fmt: (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%` },
  avg_tat: { icon: Timer, tone: "amber", fmt: formatHours },
};
const STATUS_COLORS = { in_progress: "--chart-1", needs_action: "--warning", siu: "--danger", paid: "--success", closed: "--neutral-flag" };
const VEHICLE_COLORS = { Car: "--chart-1", "2W": "--chart-2", CV: "--chart-3" };
const TYPE_COLORS = { OD: "--chart-1", TP: "--chart-3", Theft: "--chart-2", "Total loss": "--chart-8", Glass: "--chart-5" };

const SPAN = {
  4: "col-span-12 lg:col-span-6 xl:col-span-4", 5: "col-span-12 lg:col-span-6 xl:col-span-5", 3: "col-span-12 lg:col-span-6 xl:col-span-3",
  6: "col-span-12 xl:col-span-6", 8: "col-span-12 xl:col-span-8", 12: "col-span-12",
};

function Section({ id, title, description, play, children }) {
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <div>
        <h2 id={`${id}-h`} className="text-xl font-semibold text-text">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <motion.div className="grid grid-cols-12 gap-6" variants={sectionVariants} initial={play ? "hidden" : false} whileInView="show"
        viewport={{ once: true, amount: 0.08 }}>
        {children}
      </motion.div>
    </section>
  );
}

/** Dashboard (§10.5): sticky filters → KPI strip → 20 charts in 7 sections. Every number comes from GET /api/stats/dashboard. */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { filters, update, reset, active } = useDashboardFilters();
  const q = useDashboard(filters);
  const d = q.data;
  const [play] = useState(() => firstVisit("reveal:dashboard"));
  const go = useCallback((link) => navigate(drillHref(d?.base_link, link)), [navigate, d?.base_link]);

  const state = { loading: q.isPending, error: q.isError && !d ? q.error : null, onRetry: () => q.refetch(), onReset: reset };
  const empty = d ? d.total === 0 : false;
  const ch = d?.charts;
  const b = useMemo(() => {
    if (!ch) return {};
    return {
      filed: C.filedSettled(ch.filed_settled, go),
      status: C.donut(ch.status, STATUS_COLORS, go),
      vehicle: C.donut(ch.vehicle_type, VEHICLE_COLORS, go),
      type: C.donut(ch.claim_type, TYPE_COLORS, go, { pie: true }),
      channel: C.channelTrend(ch.channel_trend, go),
      amounts: C.amounts(ch.amounts, go),
      size: C.claimSize(ch.claim_size, go),
      fraud: C.fraudTrend(ch.fraud_trend, go),
      risk: C.riskDistribution(ch.risk_distribution, go),
      flags: C.fraudFlags(ch.fraud_flags, go),
      routing: C.routing(ch.routing, go),
      funnel: C.funnel(ch.funnel, go),
      tat: C.tat(ch.tat, go),
      stp: C.stpGauge(ch.stp, go),
      heat: C.heatmap(ch.heatmap, go),
      cities: C.cities(ch.cities, go),
      agents: C.agents(ch.agents),
      overrides: C.overrides(ch.overrides, go),
      yoy: C.yoy(ch.yoy, go),
    };
  }, [ch, go]);

  /** Common ChartCard props for a builder: option, clicks, table, insight, export name. */
  const card = (key, chart, extra = {}) => ({
    ...state, empty, insight: chart?.insight, exportName: `dashboard-${key}`,
    option: b[key]?.option, onItemClick: b[key]?.onItemClick, onAxisClick: b[key]?.onAxisClick, axis: b[key]?.axis, table: b[key]?.table,
    ...extra,
  });
  const legend = (key, colors) => (b[key] ? <LegendList items={b[key].items} total={ch[{ status: "status", vehicle: "vehicle_type", type: "claim_type" }[key]].total} colors={colors} onSelect={go} /> : null);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Dashboard</h1>
          <p className="text-sm text-muted">Portfolio analytics computed live from every claim · click any chart to open the matching claims</p>
        </div>
        {d && <p className="text-caption text-subtle">Updated {formatDateTime(d.generated_at)}</p>}
      </header>

      <FilterBar filters={filters} update={update} reset={reset} active={active} options={d?.options} period={d?.period} fetching={q.isFetching && !q.isPending} />

      <div className="flex flex-col gap-2">
      <p className="num text-caption text-muted" aria-live="polite">
        {d ? `Key figures for ${formatDate(d.period.from)} – ${formatDate(d.period.to)} · changes compare with the previous ${d.period.days} days (${formatDate(d.period.prior_from)} – ${formatDate(d.period.prior_to)})` : " "}
      </p>
      <motion.div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" variants={sectionVariants} initial={play ? "hidden" : false} animate="show">
        {(d?.kpis ?? Array.from({ length: 6 }, (_, i) => ({ key: `k${i}` }))).map((k) => {
          const meta = KPI[k.key] ?? {};
          return (
            <motion.div key={k.key} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }} className="min-w-0">
              <KpiCard
                label={k.label ?? "metric"} loading={q.isPending} error={state.error} onRetry={state.onRetry}
                value={k.value} format={meta.fmt} icon={meta.icon} tone={meta.tone} animateKey={`dash-${k.key}`}
                delta={k.delta ? k.delta.value : null} deltaUnit={k.delta?.unit} deltaSemantics={k.delta_semantics}
                deltaLabel="" compact spark={k.series} to={d ? drillHref(d.base_link, k.link) : undefined}
              />
            </motion.div>
          );
        })}
      </motion.div>
      </div>

      <Section id="volume" title="Volume" description="How many claims arrive, how they progress and where they come from" play={play}>
        <ChartCard {...card("filed", ch?.filed_settled)} span={SPAN[8]} height="h-80" title="Claims filed vs settled" subtitle={`Per ${d?.period.bucket ?? "period"} · settled / approved by decision date`}
          info="Filed = FNOLs in each period. Settled / approved = claims decided as approved, pre-authorised or settled in that period. Click a point to open those claims." />
        <ChartCard {...card("status", ch?.status)} span={SPAN[4]} height="h-36" chartBox="h-36 w-36 shrink-0" title="Claims by status" subtitle="Grouped into five buckets"
          info="Current status of the claims filed in the range." aside={legend("status", STATUS_COLORS)} />
        <ChartCard {...card("vehicle", ch?.vehicle_type)} span={SPAN[4]} height="h-36" chartBox="h-36 w-36 shrink-0" title="Claims by vehicle type" subtitle="Share of claims"
          info="Two-wheelers, cars and commercial vehicles." aside={legend("vehicle", VEHICLE_COLORS)} />
        <ChartCard {...card("type", ch?.claim_type)} span={SPAN[4]} height="h-36" chartBox="h-36 w-36 shrink-0" title="Claims by claim type" subtitle="OD · TP · Theft · Total loss · Glass"
          info="Own damage, third party, theft, total loss and glass-only claims." aside={legend("type", TYPE_COLORS)} />
        <ChartCard {...card("channel", ch?.channel_trend)} span={SPAN[4]} height="h-72" title="Claims by channel" subtitle={`Stacked, per ${d?.period.bucket ?? "period"}`}
          info="Where FNOLs come from: WhatsApp, app, web or branch." />
      </Section>

      <Section id="money" title="Money" description="What is claimed, approved and saved" play={play}>
        <ChartCard {...card("amounts", ch?.amounts)} span={SPAN[8]} height="h-72" title="Claimed vs approved vs saved" subtitle={`₹ per ${d?.period.bucket ?? "period"}`}
          info="Claimed = amounts on FNOL. Approved = approved amount on paid claims. Saved = claimed amount on claims declined for fraud plus garage overquote reductions." />
        <ChartCard {...card("size", ch?.claim_size)} span={SPAN[4]} height="h-72" title="Avg claim size" subtitle="By vehicle type and city tier"
          info="Average claimed amount. City tier from the cities reference (Tier 1 = metros)." />
      </Section>

      <Section id="fraud" title="Fraud" description="Explainable risk scoring and where it routes claims" play={play}>
        <ChartCard {...card("fraud", ch?.fraud_trend)} span={SPAN[6]} height="h-72" title="Fraud rate and savings" subtitle={`Per ${d?.period.bucket ?? "period"}`}
          info="Fraud detected = SIU referrals, confirmed fraud and high-risk declines, as a share of claims filed. Savings as in Money." />
        <ChartCard {...card("risk", ch?.risk_distribution)} span={SPAN[6]} height="h-72" title="Risk score distribution" subtitle="Coloured by risk band: low 0–29 · medium 30–70 · high 71–100"
          info="Fraud agent risk scores (DMN rules) of scored claims." />
        <ChartCard {...card("flags", ch?.fraud_flags)} span={SPAN[4]} height="h-80" title="Top fraud flags" subtitle="Rules that fired most (once per claim)"
          info="Fraud rules from fraud_rules.json that fired on claims in the range." empty={empty || (ch && !ch.fraud_flags.items.length)} />
        <ChartCard {...card("routing", ch?.routing)} span={SPAN[8]} height="h-80" title="Routing flow" subtitle="Risk band → route → outcome"
          info="How scored claims move from risk band to route (straight-through, handler, SIU) to their current outcome. Click a band, route, outcome or flow." />
      </Section>

      <Section id="operations" title="Operations" description="Throughput, speed and automation" play={play}>
        <ChartCard {...card("funnel", ch?.funnel)} span={SPAN[4]} height="h-64" title="Claims funnel" subtitle="FNOL → Verified → Assessed → Approved → Settled"
          info="Claims filed in the range that reached each stage. The orange stage follows the biggest drop." />
        <ChartCard {...card("tat", ch?.tat)} span={SPAN[5]} height="h-64" title="Turnaround time" subtitle="FNOL → decision · log scale"
          info="Average time from FNOL to decision for decided claims, by channel and risk band. Log scale: straight-through decisions take minutes, SIU cases take days." />
        <ChartCard {...card("stp", ch?.stp)} span={SPAN[3]} height="h-44" title="STP rate" subtitle="Auto-decided share"
          info="Straight-through processing: decisions made automatically by the AI pipeline, as a share of all decisions."
          below={ch ? (
            <div>
              <Sparkline data={ch.stp.series} tone="blue" ariaLabel="STP rate trend" />
              <p className="num mt-1 text-center text-caption text-muted">{formatNumber(ch.stp.auto)} of {formatNumber(ch.stp.decided)} decisions</p>
            </div>
          ) : null} />
        <ChartCard {...card("heat", ch?.heatmap)} span={SPAN[12]} height="h-64" title="When FNOLs arrive" subtitle="Day of week × hour (IST)"
          info="Count of FNOLs by weekday and hour, India time. Click a cell to open those claims." />
      </Section>

      <Section id="geo" title="Geography & partners" description="Where claims come from and how network garages perform" play={play}>
        <ChartCard {...card("cities", ch?.cities)} span={SPAN[6]} height="h-80" title="Claims by city" subtitle={`Top 10 of ${ch?.cities.city_count ?? "—"} cities, ranked`}
          info="Claims per city with share of the total; tier in the tooltip." />
        <ChartCard {...card("garages", ch?.garages)} span={SPAN[6]} height="h-80" title="Garage leaderboard" subtitle="Volume, average overquote and turnaround"
          info="Top garages by claim volume. Overquote = garage estimate above the AI-assessed loss. Click a garage to open its claims."
          png={false} table={ch ? C.garageTable(ch.garages) : undefined} empty={empty || (ch && !ch.garages.items.length)}>
          {ch && <GarageLeaderboard items={ch.garages.items} onSelect={go} />}
        </ChartCard>
      </Section>

      <Section id="ai" title="AI performance" description="How the agent pipeline performs and how often handlers disagree" play={play}>
        <ChartCard {...card("agents", ch?.agents)} span={SPAN[6]} height="h-72" title="Agent performance" subtitle={ch ? `Avg latency and success rate · ${ch.agents.live_runs} live + ${ch.agents.historical_runs} historical runs` : "Avg latency and success rate"}
          info="Live runs: per-agent duration and source from pipeline_runs.json (a fallback counts as a failed step). Historical claims: time between each agent's timeline events, failures from agent_fallback audit entries. Agents are not claims, so this chart has no drill-down." />
        <ChartCard {...card("overrides", ch?.overrides)} span={SPAN[6]} height="h-72" title="Human override rate" subtitle="Handler decision differs from the AI recommendation"
          info="Among claims a handler decided where the AI recommended pay or deny: the share where the handler's final decision went the other way. Dated by decision." />
      </Section>

      <Section id="yoy" title="Year-on-year" description="This financial year to date against the same period last year" play={play}>
        <ChartCard {...card("yoy", ch?.yoy)} span={SPAN[12]} height="h-64" title="This FY vs last FY" subtitle="Same period · uses the filters but not the date range"
          info="Claims filed, approved amount and fraud detected, 1 April to today, against 1 April to the same day last year." empty={false} />
      </Section>
    </div>
  );
}
