import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileStack, IndianRupee, ShieldAlert, Timer } from "lucide-react";
import { Section, Demo, Caption } from "../Section";
import { Avatar } from "../../../components/ui/Avatar";
import { KpiCard } from "../../../components/ui/KpiCard";
import { Sparkline } from "../../../components/ui/Sparkline";
import { RiskGauge } from "../../../components/ui/RiskGauge";
import { Kbd } from "../../../components/ui/Kbd";
import { CopyButton } from "../../../components/ui/CopyButton";
import { DataTable } from "../../../components/ui/DataTable";
import { ClaimStatusBadge, StatusFlag } from "../../../components/ui/StatusFlag";
import { Button } from "../../../components/ui/Button";
import { formatDate, formatINR, formatINRCompact, formatNumber, formatRegistration, riskBand } from "../../../lib/format";
import { makeDemoRows } from "../demoData";

const SPARK_A = [12, 14, 13, 17, 16, 19, 22, 21, 24, 23, 27, 29];
const SPARK_B = [8, 7, 9, 8, 11, 10, 9, 12, 11, 13, 14, 16];
const SPARK_C = [40, 38, 36, 37, 33, 31, 30, 28, 27, 25, 24, 22];

export function DataDisplay() {
  const [kpiState, setKpiState] = useState("success");
  const [counterKey, setCounterKey] = useState(0);
  const [risk, setRisk] = useState(64);
  return (
    <Section id="data-display" title="Data display" description="KPI values count up with anime.js once per session; delta chips are configurable (fraud ▲ is bad). Sparklines are ECharts minis loaded lazily.">
      <Demo label="KpiCard">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {["success", "loading", "error"].map((s) => (
            <Button key={s} size="sm" variant={kpiState === s ? "primary" : "secondary"} onClick={() => setKpiState(s)}>
              {s}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setCounterKey((k) => k + 1)}>
            Replay counters
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-4">
          {[
            { label: "Claims this month", value: 1284, format: (v) => formatNumber(Math.round(v)), delta: 12.4, spark: SPARK_A, icon: FileStack, to: "/styleguide#data-display" },
            { label: "Amount approved", value: 42800000, format: (v) => formatINRCompact(v), delta: 8.1, spark: SPARK_B, sparkTone: "orange", icon: IndianRupee },
            { label: "Fraud flagged", value: 37, format: (v) => formatNumber(Math.round(v)), delta: 5.2, deltaSemantics: "up-bad", spark: SPARK_B, sparkTone: "danger", icon: ShieldAlert },
            { label: "Avg. decision time", value: 7.4, format: (v) => `${v.toFixed(1)} min`, delta: -18.3, deltaSemantics: "up-bad", spark: SPARK_C, sparkTone: "success", icon: Timer, deltaLabel: "faster than last month" },
          ].map((k) => (
            <KpiCard key={k.label} {...k} animateKey={`sg-${k.label}-${counterKey}`} loading={kpiState === "loading"} error={kpiState === "error"} onRetry={() => setKpiState("success")} />
          ))}
        </div>
      </Demo>
      <div className="grid gap-6 xl:grid-cols-3">
        <Demo label="RiskGauge — bands 0–29 / 30–70 / 71–100">
          <div className="flex flex-col items-center gap-4">
            <RiskGauge score={risk} />
            <div className="flex flex-wrap justify-center gap-2">
              {[12, 48, 64, 88].map((s) => (
                <Button key={s} size="sm" variant={risk === s ? "primary" : "secondary"} onClick={() => setRisk(s)}>
                  {s}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setRisk(null)}>
                Pending
              </Button>
            </div>
          </div>
        </Demo>
        <Demo label="Avatars (initials fallback, never a broken image)">
          <div className="flex flex-wrap items-end gap-3">
            {["xs", "sm", "md", "lg", "xl"].map((s) => (
              <Avatar key={s} size={s} name="Santosh Kute" />
            ))}
          </div>
          <div className="mt-4 flex -space-x-2">
            {["Rahul Sharma", "Ameya Chauhan", "Priya Nair", "Imran Shaikh"].map((n) => (
              <Avatar key={n} name={n} size="md" ring />
            ))}
            <Avatar name="Broken Image" src="/assets/avatars/does-not-exist.webp" size="md" ring />
          </div>
          <Caption>The last avatar has a missing image URL and falls back to initials.</Caption>
        </Demo>
        <Demo label="Sparkline · Kbd · CopyButton">
          <div className="flex flex-col gap-4">
            <Sparkline data={SPARK_A} />
            <Sparkline data={SPARK_C} tone="orange" />
            <div className="flex items-center gap-3">
              <Kbd keys={["Ctrl", "K"]} />
              <Kbd keys={["Ctrl", "B"]} />
              <Kbd>?</Kbd>
              <Kbd>Esc</Kbd>
            </div>
            <div className="flex items-center gap-2">
              <span className="mono text-sm text-text">ABC-MC-2026-000892</span>
              <CopyButton value="ABC-MC-2026-000892" label="Copy claim ID" />
            </div>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

const COLUMNS = [
  { accessorKey: "id", header: "Claim ID", meta: { mono: true, label: "Claim ID" }, cell: ({ getValue }) => <span className="mono text-sm">{getValue()}</span> },
  {
    accessorKey: "customer",
    header: "Customer",
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Avatar name={row.original.customer} size="xs" />
        {row.original.customer}
      </span>
    ),
  },
  { accessorKey: "vehicle", header: "Vehicle" },
  { accessorKey: "registration", header: "Registration", meta: { mono: true, csv: (r) => formatRegistration(r.registration) }, cell: ({ getValue }) => formatRegistration(getValue()) },
  { accessorKey: "city", header: "City" },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <ClaimStatusBadge status={getValue()} /> },
  { accessorKey: "amount", header: "Claimed", meta: { align: "right", label: "Claimed (₹)" }, cell: ({ getValue }) => formatINR(getValue()) },
  {
    accessorKey: "risk",
    header: "Risk",
    meta: { align: "right" },
    cell: ({ getValue }) => {
      const b = riskBand(getValue());
      return <StatusFlag size="sm" level={b.level} label={`${getValue()} · ${b.key === "low" ? "Low" : b.key === "medium" ? "Med" : "High"}`} />;
    },
  },
  { accessorKey: "filedAt", header: "Filed", meta: { align: "right", csv: (r) => formatDate(r.filedAt) }, cell: ({ getValue }) => formatDate(getValue()) },
];

export function TableDemo() {
  const [mode, setMode] = useState("25");
  const rows25 = useMemo(() => makeDemoRows(25), []);
  const rows500 = useMemo(() => makeDemoRows(500, 7), []);
  const data = mode === "25" ? rows25 : mode === "500" ? rows500 : [];
  return (
    <Section id="table" title="Data table" description="Sortable headers, column visibility, density toggle, sticky header, keyboard ↑/↓/Enter, selection + CSV export, virtualised above 50 rows. Sample data only — real claims arrive in Phase 2.">
      <div className="flex flex-wrap gap-2">
        {[
          ["25", "25 rows"],
          ["500", "500 rows (virtualised)"],
          ["loading", "Loading"],
          ["empty", "Empty"],
          ["error", "Error"],
        ].map(([k, l]) => (
          <Button key={k} size="sm" variant={mode === k ? "primary" : "secondary"} onClick={() => setMode(k)}>
            {l}
          </Button>
        ))}
      </div>
      <DataTable
        key={mode === "500" ? "big" : "small"}
        title="Claims (sample)"
        columns={COLUMNS}
        data={data}
        selectable
        loading={mode === "loading"}
        error={mode === "error" ? { message: "Couldn't load claims.", error_id: "err_42" } : undefined}
        onRetry={() => setMode("25")}
        emptyTitle="No claims match these filters"
        emptyDescription="Try widening the date range."
        onRowClick={(r) => toast(`Open ${r.id}`, { description: "Claim Detail arrives in Phase 3." })}
        exportName="claims-sample.csv"
      />
    </Section>
  );
}
