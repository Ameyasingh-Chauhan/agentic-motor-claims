import { CarFront } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { StatusFlag } from "../../components/ui/StatusFlag";

const RESULT = {
  match: { level: "pass", label: "Match" },
  mismatch: { level: "fail", label: "Mismatch" },
  unclear: { level: "warn", label: "Unclear" },
};
const STATUS = {
  consistent: { level: "pass", label: "Consistent" },
  mismatch: { level: "fail", label: "Mismatch" },
  unclear: { level: "warn", label: "Unclear" },
  not_assessed: { level: "pending", label: "Not assessed" },
};
const SOURCE_LABEL = { policy: "Policy", vahan: "Vahan", rc: "RC" };

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Status of the A4 comparison; seeded claims (no reading) are historical and never assessed. */
export function identityStatus(claim) {
  const vi = claim.vehicle_identity;
  if (!vi) return { ...STATUS.not_assessed, summary: "Not assessed (historical claim)" };
  return { ...STATUS[vi.status], summary: vi.summary ?? vi.reason ?? "Not assessed" };
}

function ResultFlag({ result, levelOverride }) {
  const r = RESULT[result] ?? RESULT.unclear;
  return <StatusFlag size="sm" level={levelOverride ?? r.level} label={r.label} />;
}

function Comparison({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-caption text-muted">
          <tr className="border-b border-border">
            {["Attribute", "Seen in photos", "Policy", "Vahan", "RC", "Result"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.attribute} className="border-b border-border last:border-0">
              <td className="px-2 py-2 font-medium text-text">{r.attribute}</td>
              <td className="px-2 py-2 text-text">{r.observed ?? "—"}{r.confidence != null && r.observed ? <span className="ml-1 text-caption text-muted">({pct(r.confidence)})</span> : null}</td>
              {["policy", "vahan", "rc"].map((s) => (
                <td key={s} className="px-2 py-2 text-muted">{r.sources?.[s]?.value ?? "—"}</td>
              ))}
              <td className="px-2 py-2"><ResultFlag result={r.result} levelOverride={r.level} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Damage tab — "Vehicle identity" card (AGENT_PROMPTS.md A7): per-photo reading, cross-photo consistency, comparison table. */
export function VehicleIdentityCard({ claim }) {
  const vi = claim.vehicle_identity;
  const st = identityStatus(claim);
  if (!vi || vi.status === "not_assessed") {
    return (
      <Card compact title="Vehicle identity" actions={<StatusFlag size="sm" level="pending" label="Not assessed" />}>
        <p className="flex items-start gap-2 text-sm text-muted"><CarFront size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{st.summary}</p>
      </Card>
    );
  }
  return (
    <Card compact title="Vehicle identity" subtitle={vi.summary} actions={<StatusFlag size="sm" level={st.level} label={st.label} />}>
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-caption text-muted">
              <tr className="border-b border-border">
                {["Photo", "Make / model", "Body", "Colour", "Plate", "Same vehicle"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {vi.photos.map((p) => (
                <tr key={p.photo_id} className="border-b border-border last:border-0">
                  <td className="mono px-2 py-2 text-text">{p.photo_id}</td>
                  <td className="px-2 py-2 text-text">
                    {p.identified ? <>{[p.make, p.model].filter(Boolean).join(" ")} <span className="text-caption text-muted">({pct(p.idcon)})</span></> : <span className="text-muted">No identifying features</span>}
                  </td>
                  <td className="px-2 py-2 capitalize text-muted">{p.body ?? "—"}</td>
                  <td className="px-2 py-2 text-muted">{p.colour ?? "—"}</td>
                  <td className="mono px-2 py-2 text-muted">{p.plate_text ? `${p.plate_text} (${pct(p.plate_conf)})` : "Not readable"}</td>
                  <td className="px-2 py-2">
                    {p.same_vehicle == null ? <StatusFlag size="sm" level="pending" label="n/a" />
                      : <StatusFlag size="sm" level={p.same_vehicle ? "pass" : p.same_conf >= 0.75 ? "fail" : "warn"}
                        label={p.same_vehicle ? "Yes" : `No (${pct(p.same_conf)})`} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vi.cross_photo && (
          <div className="rounded-md border border-border px-3 py-2 text-sm">
            <StatusFlag size="sm" level={vi.cross_photo.level} label={vi.cross_photo.summary} />
            {vi.cross_photo.differing?.map((d) => <p key={d.photo_id} className="mt-1 text-muted">{d.photo_id}: {d.reason ?? "different vehicle"}</p>)}
          </div>
        )}
        <Comparison rows={vi.comparison ?? []} />
        {vi.evidence?.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-text">{vi.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
        <p className="text-caption text-subtle">Read by the Damage agent; compared in Python against the policy, Vahan and RC records (FR-16 / FR-17 / FR-18).</p>
      </div>
    </Card>
  );
}

/** Verification tab — compact rows for the "Vehicle identity" check. */
export function identityRows(claim) {
  const vi = claim.vehicle_identity;
  if (!vi || vi.status === "not_assessed") return [["Status", identityStatus(claim).summary]];
  return [
    ["Status", STATUS[vi.status]?.label ?? vi.status],
    ...(vi.comparison ?? []).map((r) => [r.attribute, `${r.observed ?? "—"} · ${RESULT[r.result]?.label ?? r.result}`]),
    ["Across photos", vi.cross_photo?.summary ?? "—"],
    ...(vi.evidence ?? []).map((e, i) => [`Evidence ${i + 1}`, e]),
  ];
}
