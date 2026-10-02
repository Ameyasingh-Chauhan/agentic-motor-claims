import { useParams } from "react-router";
import { PageHeader } from "../../components/layout/PageHeader";
export default function ClaimPlaceholderPage(){ const {claimId}=useParams(); return <><PageHeader title="Claim detail" description="Claim detail workspace is coming in Part B."/><div className="rounded-xl border border-border bg-surface p-8 text-center"><p className="font-mono text-sm text-text-muted">{claimId}</p><p className="mt-2 text-text">Claim detail will be available in Phase 3 Part B.</p></div></>; }
