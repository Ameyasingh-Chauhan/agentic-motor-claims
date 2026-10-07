import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, ScrollText, Search, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Checkbox } from "../../components/ui/Checkbox";
import { Modal } from "../../components/ui/Modal";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Badge } from "../../components/ui/Badge";
import { ClaimStatusBadge } from "../../components/ui/StatusFlag";
import { api } from "../../lib/api";
import { formatDate, formatINR } from "../../lib/format";

const KINDS = {
  claims: {
    label: "Claims", noun: "claim", icon: ScrollText, key: (r) => r.id,
    search: (r) => `${r.id} ${r.customer_name} ${r.policy_no} ${r.registration}`,
    columns: ["Claim", "Customer", "Policy", "Vehicle", "Filed", "Claimed", "Status"],
    cells: (r) => [<span className="mono">{r.id}</span>, r.customer_name, <span className="mono">{r.policy_no}</span>, r.registration,
      r.created_at ? formatDate(r.created_at) : "—", r.amount_claimed != null ? formatINR(r.amount_claimed) : "—", <ClaimStatusBadge status={r.status} />],
    effect: "Deletes the claim, its uploaded files, AI processing history and notifications. The policy stays.",
  },
  policies: {
    label: "Policies", noun: "policy", icon: FileText, key: (r) => r.policy_no,
    search: (r) => `${r.policy_no} ${r.insured} ${r.registration} ${r.vehicle}`,
    columns: ["Policy", "Insured", "Vehicle", "Registration", "Valid till", "Claims on it"],
    cells: (r) => [<span className="mono">{r.policy_no}</span>, r.insured || "—", r.vehicle || "—", r.registration || "—",
      r.end ? formatDate(r.end) : "—", r.claims ? <Badge tone="warning">{r.claims} claim{r.claims > 1 ? "s" : ""}</Badge> : "None"],
    effect: "Deletes the policy, plus its customer and vehicle record if nothing else uses them. Claims filed on it are kept.",
  },
};

function ManageList({ kind }) {
  const cfg = KINDS[kind];
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef(null);
  const list = useQuery({ queryKey: ["data-manager", kind], queryFn: () => api(`/admin/data/${kind}`) });
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data?.items || []).filter((r) => !needle || cfg.search(r).toLowerCase().includes(needle));
  }, [list.data, q, cfg]);
  const keys = rows.map(cfg.key);
  const allOn = keys.length > 0 && keys.every((k) => picked.has(k));

  const remove = useMutation({
    mutationFn: () => api(`/admin/data/${kind}/delete`, { method: "POST", body: kind === "claims" ? { ids: [...picked] } : { policy_nos: [...picked] } }),
    onSuccess: (res) => {
      const n = res.removed.length;
      const extra = res.also_removed && (res.also_removed.customers || res.also_removed.vehicles)
        ? ` (and ${res.also_removed.customers} customer, ${res.also_removed.vehicles} vehicle record)` : "";
      toast.success(`Removed ${n} ${cfg.noun}${n === 1 ? "" : "s"}${extra}`);
      setPicked(new Set());
      setConfirming(false);
      qc.invalidateQueries(); // every page and stat reads from the same files
    },
    onError: (e) => { toast.error(e.message || "Could not remove"); setConfirming(false); },
  });

  const toggle = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const shell = "rounded-lg border border-border bg-surface shadow-sm";

  if (list.isPending) return <div className={`${shell} flex flex-col gap-2 p-4`}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (list.isError) return <div className={shell}><ErrorState error={list.error} onRetry={list.refetch} retrying={list.isFetching} /></div>;

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <Input icon={Search} placeholder={`Search ${cfg.label.toLowerCase()}`} aria-label={`Search ${cfg.label.toLowerCase()}`} value={q}
          onChange={(e) => setQ(e.target.value)} className="w-80" />
        <span className="text-sm text-muted">{rows.length} of {list.data.items.length}</span>
        <div className="ml-auto flex items-center gap-3">
          {picked.size > 0 && <span className="text-sm text-muted">{picked.size} selected</span>}
          <Button variant="danger" icon={Trash2} disabled={picked.size === 0} onClick={() => setConfirming(true)}>Remove selected</Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title={q ? "No matches" : `No ${cfg.label.toLowerCase()} on file`} description={q ? "Try a different search." : undefined} />
      ) : (
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-bg-muted text-caption text-muted">
              <tr>
                <th className="w-12 px-4 py-2"><Checkbox aria-label="Select all shown" checked={allOn} indeterminate={!allOn && keys.some((k) => picked.has(k))}
                  onChange={() => setPicked(allOn ? new Set() : new Set(keys))} /></th>
                {cfg.columns.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = cfg.key(r);
                return (
                  <tr key={k} className="border-t border-border hover:bg-bg-muted">
                    <td className="px-4 py-2"><Checkbox aria-label={`Select ${k}`} checked={picked.has(k)} onChange={() => toggle(k)} /></td>
                    {cfg.cells(r).map((c, i) => <td key={i} className="px-3 py-2 text-text">{c}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={confirming} onClose={() => !remove.isPending && setConfirming(false)} initialFocusRef={cancelRef}
        title={`Remove ${picked.size} ${cfg.noun}${picked.size === 1 ? "" : "s"}?`} size="sm"
        footer={<>
          <Button ref={cancelRef} variant="secondary" onClick={() => setConfirming(false)} disabled={remove.isPending}>Cancel</Button>
          <Button variant="danger" icon={Trash2} loading={remove.isPending} onClick={() => remove.mutate()}>Remove permanently</Button>
        </>}>
        <div className="flex items-start gap-3 text-sm text-text">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p>{cfg.effect}</p>
            <p className="text-muted">This cannot be undone. Re-running the seed script restores the original sample data only.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Admin/developer-only: remove claims and policies from the whole app, each independently. */
export default function DataManagerPage() {
  const [kind, setKind] = useState("claims");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Data Manager"
        description="Remove claims and policies from the app. Each is removed on its own — deleting a claim keeps its policy, and deleting a policy keeps its claims."
        actions={<SegmentedControl label="Data type" value={kind} onChange={setKind}
          options={Object.entries(KINDS).map(([value, c]) => ({ value, label: c.label, icon: c.icon }))} />} />
      <ManageList key={kind} kind={kind} />
    </div>
  );
}
