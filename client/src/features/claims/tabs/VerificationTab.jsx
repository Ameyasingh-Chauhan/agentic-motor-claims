import { useMemo, useState } from "react";
import { Accordion, AccordionItem, Collapsible } from "../../../components/ui/Collapsible";
import { StatusFlag } from "../../../components/ui/StatusFlag";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LazyEChart } from "../../../components/charts/LazyEChart";
import { formatDate, formatDateTime, toIST } from "../../../lib/format";
import { CHECK_LABELS, CHECK_ORDER } from "../claimModel";
import { KV } from "../parts";

function FastagChart({ events, incident }) {
  const at = new Date(incident.datetime).getTime();
  const option = useMemo(() => (t) => ({
    grid: { left: 72, right: 24, top: 32, bottom: 40 },
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const e = p.data.event;
        return `<b>${e.plaza}</b> (${e.type})<br/>${formatDateTime(e.ts)}<br/>${e.distance_km != null ? `${e.distance_km} km from the reported place` : "No location"}<br/>`
          + `${e.hours_from_incident > 0 ? "+" : ""}${e.hours_from_incident} h from the reported time${e.mismatch ? "<br/><b>Contradicts the reported location</b>" : ""}`;
      },
    },
    xAxis: { type: "time", min: at - 36 * 3_600_000, max: at + 36 * 3_600_000,
      axisLabel: { formatter: (v) => toIST(v).format("DD MMM HH:mm"), hideOverlap: true } },
    yAxis: { type: "category", data: ["Parking", "Toll"], axisLine: { show: false } },
    series: [{
      type: "scatter", symbolSize: 16,
      data: events.map((e) => ({
        value: [new Date(e.ts).getTime(), e.type === "toll" ? "Toll" : "Parking"], event: e,
        symbol: e.mismatch ? "diamond" : "circle",
        itemStyle: { color: e.mismatch ? t.danger : t.palette[0], borderColor: t.bg, borderWidth: 2 },
      })),
      markLine: {
        symbol: "none", silent: true, data: [{ xAxis: at }],
        lineStyle: { color: t.text, type: "dashed", width: 2 },
        label: { formatter: "Reported incident", color: t.text, fontSize: 12, position: "insideEndTop" },
      },
    }],
  }), [events, at]);
  return <LazyEChart option={option} className="h-56" ariaLabel={`FASTag events within 36 hours of the incident: ${events.length} event(s), ${events.filter((e) => e.mismatch).length} contradicting the reported location`} />;
}

function FastagTable({ events }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-caption text-muted"><tr className="border-b border-border">
        {["Time", "Type", "Plaza", "Distance", "From reported time", "Result"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
      </tr></thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.ts + e.plaza} className="border-b border-border last:border-0">
            <td className="px-2 py-2 text-text">{formatDateTime(e.ts)}</td>
            <td className="px-2 py-2 capitalize text-muted">{e.type}</td>
            <td className="px-2 py-2 text-text">{e.plaza}, {e.city}</td>
            <td className="num px-2 py-2 text-text">{e.distance_km != null ? `${e.distance_km} km` : "—"}</td>
            <td className="num px-2 py-2 text-text">{e.hours_from_incident > 0 ? "+" : ""}{e.hours_from_incident} h</td>
            <td className="px-2 py-2"><StatusFlag size="sm" level={e.mismatch ? "fail" : "pass"} label={e.mismatch ? "Contradiction" : "Consistent"} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fastag({ claim }) {
  const events = claim.context?.fastag_events ?? [];
  const [view, setView] = useState("chart");
  if (!events.length) return <p className="text-sm text-muted">No FASTag toll or parking events within 36 hours of the reported time.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text">{events.length} event(s) within ±36 h · {events.filter((e) => e.mismatch).length} contradicting the reported place</p>
        <SegmentedControl size="sm" label="FASTag view" value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "View as table" }]} />
      </div>
      {view === "chart" ? <FastagChart events={events} incident={claim.incident} /> : <FastagTable events={events} />}
    </div>
  );
}

function fieldsFor(key, claim) {
  const ctx = claim.context ?? {};
  const p = ctx.policy;
  switch (key) {
    case "policy": return p && [["Policy", p.policy_no], ["Status", p.status], ["Valid", `${formatDate(p.start)} – ${formatDate(p.end)}`], ["Cover", p.cover],
      ["Break-in before cover", p.previous_break_in ? "Yes" : "No"]];
    case "vahan": return ctx.vahan && [["Owner", ctx.vahan.owner], ["Class", ctx.vahan.class], ["Make / model", ctx.vahan.make_model], ["RC status", ctx.vahan.rc_status],
      ["Hypothecation", ctx.vahan.hypothecation ?? "None"], ["Blacklisted", ctx.vahan.blacklisted ? "Yes" : "No"], ["Reported stolen", ctx.vahan.stolen ? "Yes" : "No"]];
    case "dl": { const d = ctx.dl ?? claim.checks?.dl?.data; return d && [["Licence", d.dl_number], ["Holder", d.holder], ["Classes", (d.classes ?? []).join(", ")],
      ["Valid to", formatDate(d.valid_to)], ["Status", d.status ?? "valid"]]; }
    case "iib": return [["Claims at other insurers", String((ctx.iib ?? []).length)], ...(ctx.iib ?? []).slice(0, 4).map((r, i) => [`#${i + 1}`, `${r.insurer} · ${r.type} · ${formatDate(r.date)}`])];
    case "police": return [["Records", String((ctx.police ?? []).length)], ...(ctx.police ?? []).map((r, i) => [`#${i + 1}`, `${r.type.replace("_", " ")} · ${r.number} · ${r.station}`])];
    case "kyc": { const k = ctx.customer?.kyc; return k && [["Aadhaar", k.aadhaar], ["PAN", k.pan], ["Verified", k.verified ? "Yes (CKYC)" : "No"]]; }
    default: return null;
  }
}

/** Verification tab (§10.4 C4): one collapsible card per check; failing/warning checks open by default. */
export function VerificationTab({ claim }) {
  const checks = claim.checks ?? {};
  const keys = CHECK_ORDER.filter((k) => checks[k]);
  if (!keys.length) return <EmptyState title="No verification checks yet" description="The Verification agent queries Vahan, FASTag, IIB, police records and KYC when the pipeline runs." />;
  const openByDefault = keys.filter((k) => checks[k].level !== "pass");
  return (
    <Accordion type="multiple" defaultValue={openByDefault.length ? openByDefault : [keys[0]]}>
      {keys.map((k) => {
        const ch = checks[k];
        const rows = fieldsFor(k, claim);
        const raw = k === "fastag" ? claim.context?.fastag_events : { ...(ch.data ?? {}), ...(rows ? Object.fromEntries(rows) : {}) };
        return (
          <div key={k} id={`check-${k}`}>
            <AccordionItem value={k} title={<span className="inline-flex items-center gap-3"><span className="font-semibold text-text">{CHECK_LABELS[k]}</span>
              <StatusFlag size="sm" level={ch.level} label={ch.level === "pass" ? "Passed" : ch.level === "fail" ? "Failed" : ch.level === "warn" ? "Warning" : "Pending"} /></span>}
              subtitle={ch.summary}>
              <div className="flex flex-col gap-4">
                {k === "fastag" ? <Fastag claim={claim} /> : rows && <KV rows={rows} />}
                <p className="text-caption text-subtle">Response time {ch.latency_ms} ms · mock {CHECK_LABELS[k]} service</p>
                <Collapsible title={<span className="text-sm font-medium text-text">Raw response (JSON)</span>} headerClassName="px-0" contentClassName="px-0">
                  <pre className="mono max-h-64 overflow-auto rounded-md bg-bg-muted p-3 text-caption text-text">{JSON.stringify(raw ?? {}, null, 2)}</pre>
                </Collapsible>
              </div>
            </AccordionItem>
          </div>
        );
      })}
    </Accordion>
  );
}
