import { Plus, Search } from "lucide-react";
import { Section } from "../Section";
import { Button } from "../../../components/ui/Button";
import { StatusFlag, ClaimStatusBadge } from "../../../components/ui/StatusFlag";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Checkbox, Switch } from "../../../components/ui/Checkbox";
import { Progress } from "../../../components/ui/Progress";
import { Skeleton } from "../../../components/ui/Skeleton";
import { Avatar } from "../../../components/ui/Avatar";
import { RiskGauge } from "../../../components/ui/RiskGauge";
import { BrandLogo } from "../../../components/ui/BrandLogo";
import { formatINR } from "../../../lib/format";

function Panel({ theme }) {
  return (
    <div data-theme={theme} className="rounded-xl border border-border bg-bg p-6 text-text">
      <div className="mb-4 flex items-center justify-between">
        <BrandLogo />
        <Badge tone="outline">{theme === "dark" ? "Dark" : "Light"} theme</Badge>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <Avatar name="Rahul Sharma" />
          <div className="min-w-0 flex-1">
            <p className="mono text-sm text-text">ABC-MC-2026-000892</p>
            <p className="text-caption text-subtle">Rahul Sharma · Maruti Swift · Pune</p>
          </div>
          <ClaimStatusBadge status="UNDER_REVIEW" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusFlag level="pass" label="Vahan verified" size="sm" />
          <StatusFlag level="warn" label="Overquote 18%" size="sm" />
          <StatusFlag level="fail" label="FASTag mismatch" size="sm" />
          <StatusFlag level="pending" label="IIB pending" size="sm" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-caption text-subtle">Net payable</p>
            <p className="num text-3xl text-text">{formatINR(24130)}</p>
          </div>
          <RiskGauge score={58} size="sm" />
        </div>
        <Progress value={64} label="Documents verified" showValue className="mt-2" />
        <div className="mt-4 flex flex-col gap-3">
          <Input icon={Search} placeholder="Search claims…" aria-label={`Search (${theme} preview)`} />
          <div className="flex items-center gap-6">
            <Checkbox label="Checked" checked onChange={() => {}} />
            <Switch label="Switch" checked onChange={() => {}} />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button icon={Plus}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="link">Link</Button>
        </div>
      </div>
    </div>
  );
}

/** Light and dark rendered side by side (tokens resolve per [data-theme] subtree). */
export function ThemePreview() {
  return (
    <Section id="themes" title="Both themes, side by side" description="The same components forced into light and dark. Every section below follows the app theme — toggle it from the Topbar to review them in either mode.">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel theme="light" />
        <Panel theme="dark" />
      </div>
    </Section>
  );
}
