import { motion } from "motion/react";
import { Calculator, Info } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { StatusFlag } from "../../../components/ui/StatusFlag";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { formatINR, formatPercent } from "../../../lib/format";
import { EASE, firstVisit } from "../../../lib/motion";

const SIGN = { minus: "−", plus: "+", subtotal: "=", total: "=", base: "" };

function money(v) {
  return formatINR(Math.abs(v));
}

/** Financials tab (§10.4 C6). Every figure comes from claim.financials as computed by costing.py; the ladder rows are built server-side. */
export function FinancialsTab({ claim }) {
  const f = claim.financials;
  const ladder = claim.context?.ladder;
  if (!f || !ladder) return <EmptyState title="AI estimate pending" description="The costing engine prices every part, labour and paint line once the Damage agent has assessed the photos." />;
  const animate = firstVisit(`ladder-${claim.id}`);
  const level = f.variance_level ?? "pass";
  const tl = f.total_loss_check ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div id="variance" className="grid gap-4 md:grid-cols-3">
        <Card compact><p className="text-sm text-muted">AI estimate (assessed loss)</p><p className="num mt-1 text-2xl font-semibold text-text">{formatINR(f.assessed_loss)}</p></Card>
        <Card compact><p className="text-sm text-muted">Garage quote</p><p className="num mt-1 text-2xl font-semibold text-text">{formatINR(f.garage_quote)}</p></Card>
        <Card compact>
          <p className="text-sm text-muted">Variance</p>
          <div className="mt-2"><StatusFlag level={level} label={`${f.variance_pct > 0 ? "+" : ""}${formatPercent(f.variance_pct)} ${level === "pass" ? "within tolerance" : level === "warn" ? "above estimate" : "overquote"}`} /></div>
          <p className="mt-2 text-caption text-muted">Tolerance 15% · above 30% is treated as an overquote</p>
        </Card>
      </div>

      <Card compact title="Line items" subtitle={`Vehicle age ${f.vehicle_age_months} months · labour ₹${f.labour_rate}/h${f.zero_dep ? " · zero depreciation" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="text-left text-caption text-muted">
              <tr className="border-b border-border">
                {["Part code", "Part", "Operation", "Material", "Base price", "Dep. %", "Dep. ₹", "Net", "Labour", "Paint", "Line total"].map((h, i) => (
                  <th key={h} className={cn("px-2 py-2 font-medium", i >= 4 && "text-right")}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={`${l.part_code}-${i}`} className="border-b border-border last:border-0">
                  <td className="mono px-2 py-2 text-muted">{l.part_code}</td>
                  <td className="px-2 py-2 text-text">{l.description}</td>
                  <td className="px-2 py-2 text-text">{l.operation.replaceAll("_", " ")}</td>
                  <td className="px-2 py-2 capitalize text-muted">{l.material}</td>
                  <td className="num px-2 py-2 text-right text-text">{formatINR(l.base_price)}</td>
                  <td className="num px-2 py-2 text-right text-text">{formatPercent(l.dep_pct, 0)}</td>
                  <td className="num px-2 py-2 text-right text-text">{formatINR(l.dep_amount)}</td>
                  <td className="num px-2 py-2 text-right text-text">{formatINR(l.net_parts)}</td>
                  <td className="num px-2 py-2 text-right text-text" title={`${l.labour_hours} h × ₹${l.labour_rate}`}>{formatINR(l.labour)}<div className="text-caption text-subtle">{l.labour_hours} h</div></td>
                  <td className="num px-2 py-2 text-right text-text">{formatINR(l.paint)}{l.paint_material_dep ? <div className="text-caption text-subtle">−{formatINR(l.paint_material_dep)} mat.</div> : null}</td>
                  <td className="num px-2 py-2 text-right font-semibold text-text">{formatINR(l.line_total)}</td>
                </tr>
              ))}
              {(f.extras ?? []).map((e, i) => (
                <tr key={`extra-${i}`} className="border-b border-border last:border-0">
                  <td className="px-2 py-2 text-muted">—</td><td className="px-2 py-2 text-text" colSpan={9}>{e.description}</td>
                  <td className="num px-2 py-2 text-right font-semibold text-text">{formatINR(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card compact title={<span className="inline-flex items-center gap-2"><Calculator size={18} className="text-subtle" aria-hidden="true" />Calculation</span>}>
          <ol>
            {ladder.map((s, i) => (
              <motion.li key={s.label + i}
                initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE, delay: animate ? i * 0.06 : 0 }}
                className={cn("flex items-baseline justify-between gap-4 py-2",
                  (s.kind === "subtotal" || s.kind === "total") && "border-t border-border",
                  s.kind === "total" && "mt-1 border-t-2 pt-3")}>
                <span className={cn("text-sm", s.kind === "subtotal" || s.kind === "total" ? "font-semibold text-text" : "text-text")}>
                  <span className="mono mr-2 inline-block w-3 text-muted" aria-hidden="true">{SIGN[s.kind]}</span>{s.label}
                  {s.note && <span className="block pl-5 text-caption text-subtle">{s.note}</span>}
                </span>
                <span className={cn("num shrink-0", s.kind === "total" ? "text-2xl font-semibold text-success" : s.kind === "minus" ? "text-muted" : "text-text",
                  s.kind === "subtotal" && "font-semibold")}>
                  {s.kind === "total" ? formatINR(s.display ?? s.amount) : money(s.amount)}
                </span>
              </motion.li>
            ))}
          </ol>
        </Card>

        <Card compact title="Notes">
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0 text-tint-blue" aria-hidden="true" />
              <span>{f.zero_dep ? "Zero-depreciation add-on applied: parts are paid at full price." : "No zero-depreciation add-on: age-based depreciation applies to parts and paint material."}</span></li>
            <li id="total-loss" className="flex items-start gap-2">
              <StatusFlag size="sm" level={tl.is_total_loss ? "warn" : "pass"} label={tl.is_total_loss ? "Total loss" : "Repairable"} className="shrink-0" />
              <span>Assessed loss {formatINR(f.assessed_loss)} against the {tl.threshold_pct}% total-loss threshold of the IDV ({formatINR(tl.idv)}).
                {tl.is_total_loss ? " Settled on the IDV less salvage and deductibles." : ""}</span>
            </li>
            {f.ncb_impact && (
              <li className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0 text-tint-blue" aria-hidden="true" />
                <span>No-claim bonus at renewal: {f.ncb_impact.current_pct}% → {f.ncb_impact.after_claim_pct}%.</span></li>
            )}
            {f.llm_arithmetic_discrepancy && (
              <li className="flex items-start gap-2"><StatusFlag size="sm" level="warn" label="Python wins" className="shrink-0" />
                <span>The AI's own arithmetic differed from the costing engine; the engine's figure is used and the difference is in the audit log.</span></li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
