import { CircleCheck } from "lucide-react";
import { Skeleton } from "../../components/ui/Skeleton";
import { AnimatedNumber } from "../../components/ui/AnimatedNumber";
import { APP_NAME } from "../../config/app";
import { formatNumber } from "../../lib/format";
import { AgentPipelineMini } from "./AgentPipelineMini";

// Customer copy never mentions fraud, risk or internal checks (CLAUDE.md rule 5).
const CUSTOMER_DESCRIPTION =
  "AI agents that take your motor claim from first notice to decision — checking your vehicle and policy details, " +
  "assessing damage from your photos, and settling straightforward claims in minutes.";
const DESCRIPTION =
  "AI agents that take a motor claim from first notice to decision — verifying vehicles through India's digital public " +
  "infrastructure, assessing damage from photos, scoring fraud with explainable evidence, and settling clean claims in minutes.";

function Stat({ label, value, format = (v) => formatNumber(Math.round(v)), suffix, loading }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted">{label}</dt>
      <dd className="num mt-1 text-2xl text-text">
        {loading ? <Skeleton className="h-8 w-16" /> : <><AnimatedNumber value={value} format={format} animateKey={`hero-${label}`} />{suffix}</>}
      </dd>
    </div>
  );
}

/** Hero (§10.3 B): title, description, today's pulse, and the live 7-agent pipeline with "Agents online". */
export function HeroCard({ hero, loading, customer }) {
  const stats = customer
    ? [
        { label: "Claims filed", value: hero?.claims_filed },
        { label: "In progress", value: hero?.in_progress },
        { label: "Avg AI decision time", value: hero?.avg_ai_seconds, suffix: " s" },
      ]
    : [
        { label: "Claims processed today", value: hero?.processed_today },
        { label: "Flagged today", value: hero?.flagged_today },
        { label: "Avg AI decision time", value: hero?.avg_ai_seconds, suffix: " s" },
      ];

  return (
    <section className="home-hero rounded-xl border border-border bg-surface p-8 shadow-sm" aria-labelledby="hero-title">
      <div className="grid grid-cols-12 items-center gap-8">
        <div className="col-span-12 min-w-0 xl:col-span-7">
          <h2 id="hero-title" className="text-4xl text-text">{APP_NAME}</h2>
          <p className="prose-width mt-3 text-base text-muted">{customer ? CUSTOMER_DESCRIPTION : DESCRIPTION}</p>
          <dl className="mt-6 grid max-w-xl grid-cols-3 gap-6 border-t border-border pt-5">
            {stats.map((s) => <Stat key={s.label} {...s} loading={loading} />)}
          </dl>
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-caption text-muted">Live agent pipeline</span>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-success-bg px-3 text-caption font-semibold text-success">
              <CircleCheck size={14} aria-hidden="true" />
              Agents online {hero ? `${hero.agents_online}/${hero.agents_total}` : "7/7"}
            </span>
          </div>
          <AgentPipelineMini customer={customer} />
        </div>
      </div>
    </section>
  );
}
