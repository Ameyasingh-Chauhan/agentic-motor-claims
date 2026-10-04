import { useState } from "react";
import { FileText } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { StatusFlag } from "../../../components/ui/StatusFlag";
import { FileTile } from "../../../components/ui/FileTile";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { formatDateTime } from "../../../lib/format";
import { DOC_STATUS } from "../claimModel";
import { KV, Photo } from "../parts";

const GROUPS = [["mandatory", "Mandatory"], ["conditional", "Conditional"], ["optional", "Optional"]];
const DOC_LEVEL = { verified: "pass", mismatch: "fail", flagged: "warn", received: "pending" };
const DOC_LABEL = { verified: "Verified", mismatch: "Mismatch", flagged: "Unclear", received: "Awaiting check" };

function title(s) {
  return s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Document viewer: image left, AI-extracted fields with field-level match flags right (§10.4 C7). */
export function DocumentViewer({ doc, onClose, internal = true }) {
  if (!doc) return null;
  const checks = Object.fromEntries((doc.checks ?? []).map((c) => [c.field, c]));
  const extracted = Object.entries(doc.extracted ?? {});
  return (
    <Modal open onClose={onClose} size="xl" title={`${doc.type} · ${doc.id}`} description={`Uploaded ${formatDateTime(doc.uploaded_at)}`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {doc.url ? (
          doc.mime === "application/pdf"
            ? <a href={doc.url} target="_blank" rel="noreferrer" className="flex h-64 items-center justify-center gap-2 rounded-md border border-border text-blue-600 hover:underline"><FileText size={20} aria-hidden="true" />Open the PDF</a>
            : <Photo src={doc.url} alt={`${doc.type} document`} className="max-h-[70dvh] min-h-64 rounded-md border border-border" imgClassName="object-contain" />
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md bg-bg-muted text-sm text-muted">
            <FileText size={24} aria-hidden="true" />{doc.type === "KYC" ? "Verified through the CKYC registry — no image is stored" : "Recorded without an image"}
          </div>
        )}
        <div className="flex flex-col gap-4">
          <StatusFlag level={DOC_LEVEL[doc.status] ?? "pending"} label={DOC_LABEL[doc.status] ?? doc.status} className="self-start" />
          {internal && extracted.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-text">Extracted by the Document agent</p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {extracted.map(([k, v]) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 align-top text-muted">{title(k)}</td>
                      <td className="py-2 pr-3 align-top text-text">{v === null || v === "" ? "—" : String(v)}</td>
                      <td className="py-2 text-right align-top">{checks[k] && <StatusFlag size="sm" level={checks[k].level} label={checks[k].level === "pass" ? "Match" : checks[k].level === "fail" ? "Mismatch" : "Check"} title={checks[k].message} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : internal ? <p className="text-sm text-muted">No fields extracted yet — the Document agent reads uploads when the pipeline runs.</p> : null}
          {internal && (doc.checks ?? []).length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {doc.checks.map((c) => (
                <li key={c.field + c.message} className="flex items-start gap-2"><StatusFlag size="sm" level={c.level} label={title(c.field)} className="shrink-0" /><span className="text-text">{c.message}</span></li>
              ))}
            </ul>
          )}
          {doc.size_kb && <KV rows={[["File", doc.original_name ?? `${doc.id}`], ["Size", `${doc.size_kb} KB`]]} />}
        </div>
      </div>
    </Modal>
  );
}

/** Documents tab (§10.4 C7): checklist from document_requirements.json + uploaded document tiles → viewer. */
export function DocumentsTab({ claim, internal = true }) {
  const [open, setOpen] = useState(null);
  const docs = claim.documents ?? [];
  const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
  const checklist = claim.document_checklist ?? [];
  const listed = new Set(checklist.map((c) => c.document_id).filter(Boolean));
  const others = docs.filter((d) => !listed.has(d.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {GROUPS.map(([g, label]) => {
          const items = checklist.filter((c) => c.group === g);
          return (
            <Card compact key={g} title={label} subtitle={g === "conditional" ? "Applies because of this claim's circumstances" : undefined}>
              {items.length === 0 ? <p className="text-sm text-muted">{g === "conditional" ? "None apply to this claim." : "None."}</p> : (
                <ul className="flex flex-col gap-2">
                  {items.map((c) => {
                    const st = c.status === "missing" && g === "mandatory" ? { level: "fail", label: "Missing (mandatory)" } : DOC_STATUS[c.status];
                    const doc = byId[c.document_id];
                    return (
                      <li key={c.doc} id={`doc-${c.doc}`}>
                        <button type="button" disabled={!doc} onClick={() => setOpen(doc)}
                          className={cn("flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left", doc && "hover:bg-bg-muted")}>
                          <span className="min-w-0">
                            <span className="block text-sm text-text">{c.label}</span>
                            {c.reason && <span className="block text-caption text-subtle">{c.reason}</span>}
                          </span>
                          <StatusFlag size="sm" level={st.level} label={st.label} className="shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Card compact title="Uploaded documents" subtitle={`${docs.length} file(s)`}>
        {docs.length === 0 ? <EmptyState compact title="No documents yet" description="Documents uploaded by the customer or branch appear here." /> : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...docs.filter((d) => listed.has(d.id)), ...others].map((d) => (
              <li key={d.id}>
                <FileTile name={`${d.type} · ${d.id}`} kind={d.thumb ? "image" : "doc"} thumb={d.thumb} size={d.size_kb ? d.size_kb * 1024 : undefined}
                  uploadedAt={d.uploaded_at} flag={{ level: DOC_LEVEL[d.status] ?? "pending", label: DOC_LABEL[d.status] ?? d.status }} onOpen={() => setOpen(d)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <DocumentViewer doc={open} onClose={() => setOpen(null)} internal={internal} />
    </div>
  );
}
