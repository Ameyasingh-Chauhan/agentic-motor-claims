import { useAuthStore } from "../../store/authStore";
import { isCustomer } from "../../lib/permissions";
import { ClaimsBrowser } from "./ClaimsBrowser";
import { Greeting } from "./Greeting";
import { HeroCard } from "./HeroCard";
import { KpiGrid } from "./KpiGrid";
import { NeedsAttention } from "./NeedsAttention";
import { RecentActivity } from "./RecentActivity";
import { Reveal, RevealScope } from "./Reveal";
import { StatusDonut } from "./StatusDonut";
import { ScrollToClaims } from "./ScrollToClaims";
import { HomeReturnMemory } from "./HomeReturnMemory";
import { useHomeStats } from "./useHomeData";
import "./home.css";

/**
 * Home (§10.3): greeting → hero → KPI grid (4 × 2) → needs attention + status donut + activity → claims browser.
 * Customers get the same layout with their own, customer-safe data (server-shaped).
 * Only ClaimsBrowser subscribes to the URL, so filtering never re-renders the hero, KPIs or insights.
 */
export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const customer = isCustomer(user);
  const stats = useHomeStats();
  const s = stats.data;
  const common = { loading: stats.isPending, error: stats.isError ? stats.error : null, onRetry: stats.refetch };

  return (
    <RevealScope id="home">
      <div className="flex flex-col gap-6">
        <Reveal index={0}><Greeting user={user} /></Reveal>
        <Reveal index={0}><HeroCard hero={s?.hero} loading={stats.isPending} customer={customer} /></Reveal>
        <KpiGrid kpis={s?.kpis} {...common} customer={customer} />
        <div className="grid grid-cols-12 items-start gap-6">
          <Reveal index={9} className="col-span-12 min-w-0 xl:col-span-8">
            <NeedsAttention items={s?.needs_attention} {...common} customer={customer} />
          </Reveal>
          <Reveal index={10} className="col-span-12 flex min-w-0 flex-col gap-6 xl:col-span-4">
            <StatusDonut buckets={s?.status_buckets} total={s?.total_claims} {...common} />
            <RecentActivity events={s?.recent_activity} {...common} customer={customer} />
          </Reveal>
        </div>
        <Reveal index={11}><ClaimsBrowser customer={customer} /></Reveal>
        <ScrollToClaims />
        <HomeReturnMemory />
      </div>
    </RevealScope>
  );
}
