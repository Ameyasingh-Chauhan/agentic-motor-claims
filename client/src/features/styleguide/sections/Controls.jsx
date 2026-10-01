import { useState } from "react";
import { Check, Download, Lock, Plus, Search, Send, Settings, ShieldAlert, Trash2, User, Car, Bike, Truck } from "lucide-react";
import { Section, Demo, Caption } from "../Section";
import { Button, IconButton } from "../../../components/ui/Button";
import { Badge, CountBadge } from "../../../components/ui/Badge";
import { StatusFlag, ClaimStatusBadge, CLAIM_STATUSES } from "../../../components/ui/StatusFlag";
import { Field, Input, Textarea } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Checkbox, Switch } from "../../../components/ui/Checkbox";
import { DateRangePicker } from "../../../components/ui/DateRangePicker";

export function Buttons() {
  const [loading, setLoading] = useState(false);
  const run = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1600);
  };
  const variants = ["primary", "secondary", "ghost", "danger", "link"];
  return (
    <Section id="buttons" title="Buttons" description="Variants primary · secondary · ghost · danger · link. Sizes sm 32 / md 40 / lg 48. Loading keeps the button width; disabled buttons explain why on hover/focus.">
      <Demo label="Variants × sizes">
        <div className="flex flex-col gap-4">
          {variants.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-4">
              <span className="mono w-24 text-caption text-muted">{v}</span>
              {["sm", "md", "lg"].map((s) => (
                <Button key={s} variant={v} size={s} icon={v === "link" ? undefined : v === "danger" ? Trash2 : Plus}>
                  {v === "danger" ? "Reject claim" : "File a claim"}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Demo>
      <Demo label="States">
        <div className="flex flex-wrap items-center gap-4">
          <Button icon={Send}>Default</Button>
          <Button icon={Send} loading>
            Loading with icon
          </Button>
          <Button loading>Loading, no icon</Button>
          <Button variant="secondary" icon={Download} loading={loading} onClick={run}>
            {loading ? "Exporting…" : "Click to load"}
          </Button>
          <Button disabledReason="Upload all photos before submitting" icon={Check}>
            Disabled (hover me)
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button iconRight={Send} variant="secondary">
            Icon right
          </Button>
        </div>
      </Demo>
      <Demo label="Icon buttons (label → aria-label + tooltip)">
        <div className="flex flex-wrap items-center gap-4">
          <IconButton icon={Settings} label="Settings" />
          <IconButton icon={Search} label="Search" variant="secondary" />
          <IconButton icon={Plus} label="Add" variant="solid" />
          <IconButton icon={Trash2} label="Delete (small)" size="sm" iconSize={16} />
          <IconButton icon={Download} label="Download (large)" size="lg" variant="secondary" />
        </div>
      </Demo>
    </Section>
  );
}

export function Flags() {
  return (
    <Section id="flags" title="Status flags & badges" description="Green / amber / red / grey always carry an icon AND a text label (rule 7). Risk bands: 0–29 Low, 30–70 Medium, 71–100 High.">
      <Demo label="StatusFlag levels">
        <div className="flex flex-wrap items-center gap-3">
          <StatusFlag level="pass" label="Verified" />
          <StatusFlag level="pass" label="Fresh damage" />
          <StatusFlag level="warn" label="Overquote 15–30%" />
          <StatusFlag level="warn" label="Medium risk" />
          <StatusFlag level="fail" label="Pre-existing damage" />
          <StatusFlag level="fail" label="High risk" />
          <StatusFlag level="pending" label="Not applicable" />
          <StatusFlag level="pending" label="Pending" size="sm" />
          <StatusFlag level="pass" label="Matches" size="sm" />
        </div>
      </Demo>
      <Demo label="ClaimStatusBadge — handler view (all 12 statuses)">
        <div className="flex flex-wrap items-center gap-3">
          {Object.keys(CLAIM_STATUSES).map((s) => (
            <ClaimStatusBadge key={s} status={s} />
          ))}
        </div>
      </Demo>
      <Demo label="ClaimStatusBadge — customer view (never mentions fraud or investigations)">
        <div className="flex flex-wrap items-center gap-3">
          {Object.keys(CLAIM_STATUSES).map((s) => (
            <ClaimStatusBadge key={s} status={s} audience="customer" />
          ))}
        </div>
      </Demo>
      <Demo label="Badges & counts">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge tone="blue">AI extracted</Badge>
          <Badge tone="orange">New</Badge>
          <Badge tone="success" icon={Check}>
            Approved
          </Badge>
          <Badge tone="warning">Low confidence</Badge>
          <Badge tone="danger" icon={ShieldAlert}>
            SIU
          </Badge>
          <Badge tone="outline">Outline</Badge>
          <Badge tone="neutral" mono>
            MH 12 AB 1234
          </Badge>
          <CountBadge count={3} />
          <CountBadge count={128} tone="neutral" />
          <CountBadge count={2} tone="danger" />
        </div>
      </Demo>
    </Section>
  );
}

const VEHICLE_OPTIONS = [
  { value: "car", label: "Private car", icon: Car },
  { value: "tw", label: "Two-wheeler", icon: Bike },
  { value: "cv", label: "Commercial vehicle", icon: Truck, description: "LCV / goods carrier" },
  { value: "bus", label: "Bus (not covered)", disabled: true },
];

export function Forms() {
  const [vehicle, setVehicle] = useState("car");
  const [checks, setChecks] = useState({ a: true, b: false });
  const [sw, setSw] = useState(true);
  const [range, setRange] = useState({ from: null, to: null, preset: null });
  const [name, setName] = useState("");
  return (
    <Section id="forms" title="Form controls" description="Labels on every input, inline validation (aria-invalid + described error), 40px controls, 16px body text.">
      <div className="grid gap-6 xl:grid-cols-2">
        <Demo label="Inputs">
          <div className="flex flex-col gap-4">
            <Field label="Username" hint="As shown on your policy schedule." required>
              {(p) => <Input {...p} icon={User} placeholder="e.g. Rahul Sharma" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Password" error="Incorrect username or password.">
              {(p) => <Input {...p} icon={Lock} type="password" defaultValue="wrong-pass" />}
            </Field>
            <Field label="Policy number (disabled)">{(p) => <Input {...p} disabled value="ABC/MOT/2026/004512" readOnly />}</Field>
            <Field label="Search (small)">{(p) => <Input {...p} size="sm" icon={Search} placeholder="Claim ID, registration…" />}</Field>
            <Field label="Describe what happened" hint="Any Indian language is fine.">
              {(p) => <Textarea {...p} placeholder="I was driving on the Pune–Mumbai expressway when…" />}
            </Field>
          </div>
        </Demo>
        <Demo label="Selection controls">
          <div className="flex flex-col gap-6">
            <Field label="Vehicle type">{(p) => <Select {...p} options={VEHICLE_OPTIONS} value={vehicle} onChange={setVehicle} />}</Field>
            <Field label="Garage (placeholder state)">{(p) => <Select {...p} options={VEHICLE_OPTIONS.slice(0, 2)} value={null} onChange={() => {}} placeholder="Choose a network garage" />}</Field>
            <Field label="Disabled select">{(p) => <Select {...p} options={VEHICLE_OPTIONS} value="tw" disabled />}</Field>
            <div className="flex flex-col gap-3">
              <Checkbox label="Vehicle was being driven by the policyholder" checked={checks.a} onChange={(v) => setChecks((c) => ({ ...c, a: v }))} />
              <Checkbox label="Police FIR filed" description="Required for theft and third-party injury." checked={checks.b} onChange={(v) => setChecks((c) => ({ ...c, b: v }))} />
              <Checkbox label="Indeterminate (some rows selected)" indeterminate />
              <Checkbox label="Disabled" disabled checked />
            </div>
            <div className="flex flex-col gap-3">
              <Switch label="Presentation mode" description="Paces agent steps for demos." checked={sw} onChange={setSw} />
              <Switch label="Small switch" size="sm" checked={!sw} onChange={(v) => setSw(!v)} />
              <Switch label="Disabled switch" disabled checked />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text">Date range</span>
              <DateRangePicker value={range} onChange={setRange} />
              <Caption>
                Value: {range.from ? `${range.from} → ${range.to}${range.preset ? ` (${range.preset})` : ""}` : "all time"}
              </Caption>
            </div>
          </div>
        </Demo>
      </div>
    </Section>
  );
}
