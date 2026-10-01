import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CircleCheck, Copy, FileText, IndianRupee, MoreHorizontal, Pencil, ShieldAlert, Trash2, UserPlus, Wallet, Car, ScrollText, MessageSquare, History } from "lucide-react";
import { Section, Demo, Caption } from "../Section";
import { Card } from "../../../components/ui/Card";
import { Collapsible, Accordion, AccordionItem } from "../../../components/ui/Collapsible";
import { Tabs } from "../../../components/ui/Tabs";
import { Modal, Drawer } from "../../../components/ui/Modal";
import { Tooltip } from "../../../components/ui/Tooltip";
import { Popover, DropdownMenu } from "../../../components/ui/Popover";
import { Button, IconButton } from "../../../components/ui/Button";
import { Field, Input, Textarea } from "../../../components/ui/Input";
import { useShortcutsStore } from "../../../components/layout/shortcutsStore";

export function Cards() {
  return (
    <Section id="cards" title="Cards, collapsibles & accordion" description="One shared Collapsible implementation: animated height, chevron rotates 180°, aria-expanded/controls, optional persistKey, content unmounts after the close animation.">
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Card title" subtitle="Subtitle explains the content" actions={<IconButton icon={MoreHorizontal} label="More actions" size="sm" />}>
          <p className="text-sm text-muted">Body content uses 24px padding. Cards sit 24px apart on the 12-column grid.</p>
        </Card>
        <Card
          title="With footer"
          subtitle="Footer holds secondary actions"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button size="sm">Save</Button>
            </div>
          }
        >
          <p className="text-sm text-muted">The footer is separated by a border.</p>
        </Card>
        <Card compact title="Compact card" subtitle="16px padding">
          <p className="text-sm text-muted">Used for dense side rails.</p>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card collapsible persistKey="styleguide-card" title="Collapsible card (persisted)" subtitle="Collapse me, then reload — the state is remembered">
          <p className="text-sm text-muted">
            Collapsible cards use the same Collapsible component. Siblings below move smoothly; nothing jumps.
          </p>
          <div className="mt-3 h-24 rounded-md bg-bg-muted" />
        </Card>
        <Demo label="Bare Collapsible">
          <Collapsible title="Why was this claim flagged?" subtitle="3 rules matched" defaultOpen>
            <ul className="list-disc pl-5 text-sm text-muted">
              <li>Policy started 9 days before the incident.</li>
              <li>Repair estimate 28% above the grounded cost.</li>
              <li>FASTag shows the vehicle 180 km away at the time.</li>
            </ul>
          </Collapsible>
          <Collapsible title="Disabled collapsible" subtitle="No content yet" disabled />
        </Demo>
      </div>
      <Accordion type="single" defaultValue="docs" persistKey="styleguide-acc">
        <AccordionItem value="docs" title="Which documents do I need?" subtitle="Single-open accordion">
          RC, driving licence, policy copy, and photos of the damage. An FIR is needed for theft or injury.
        </AccordionItem>
        <AccordionItem value="time" title="How long does approval take?">
          Most clean claims are decided within minutes once all documents are in.
        </AccordionItem>
        <AccordionItem value="garage" title="Can I choose my own garage?">
          Yes. Network garages offer cashless repair; others are reimbursed after the invoice.
        </AccordionItem>
      </Accordion>
    </Section>
  );
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "documents", label: "Documents", icon: FileText, count: 6 },
  { value: "damage", label: "Damage", icon: Camera, count: 4 },
  { value: "fraud", label: "Fraud Analysis", icon: ShieldAlert, count: 2, countTone: "danger" },
  { value: "financial", label: "Financial", icon: IndianRupee },
  { value: "vehicle", label: "Vehicle & DPI", icon: Car },
  { value: "comms", label: "Communication", icon: MessageSquare },
  { value: "audit", label: "Audit trail", icon: History },
  { value: "policy", label: "Policy", icon: ScrollText },
];

export function TabsDemo() {
  return (
    <Section id="tabs" title="Tabs" description="Sliding underline (layoutId), ←/→/Home/End keys, URL-synced (?tab=…), overflow scroll with fade edges, badge counts.">
      <Demo label="URL-synced tabs — the selected tab survives reload and back/forward">
        <div className="max-w-3xl">
          <Tabs tabs={TABS} urlParam="tab">
            {(value) => (
              <p className="text-sm text-muted">
                Panel for <span className="mono text-text">{value}</span>. Check the address bar.
              </p>
            )}
          </Tabs>
        </div>
      </Demo>
    </Section>
  );
}

export function Overlays() {
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const firstField = useRef(null);
  const openPalette = useShortcutsStore((s) => s.setPaletteOpen);
  const openShortcuts = useShortcutsStore((s) => s.setOpen);

  const undoToast = () =>
    toast.success("Claim ABC-MC-2026-000892 approved", {
      description: "Pre-authorisation sent to Sai Motors, Pune.",
      action: { label: "Undo", onClick: () => toast("Approval undone") },
    });

  return (
    <Section id="overlays" title="Overlays & feedback" description="Modal and Drawer trap focus, close on Esc, lock scroll and return focus to the trigger. Toasts are bottom-right with Undo for reversible actions.">
      <Demo label="Modal / Drawer / Command palette">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setModal(true)} icon={Pencil}>
            Open form modal
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)} icon={Trash2}>
            Open confirm modal
          </Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Open drawer
          </Button>
          <Button variant="secondary" onClick={() => openPalette(true)}>
            Command palette (Ctrl K)
          </Button>
          <Button variant="secondary" onClick={() => openShortcuts(true)}>
            Shortcuts (?)
          </Button>
        </div>
      </Demo>
      <div className="grid gap-6 xl:grid-cols-3">
        <Demo label="Tooltip">
          <div className="flex flex-wrap gap-3">
            <Tooltip content="Appears on hover after 300 ms, and on focus immediately">
              <Button variant="secondary">Hover or focus me</Button>
            </Tooltip>
            <Tooltip content="Placed on the right" placement="right">
              <Button variant="ghost">Right</Button>
            </Tooltip>
          </div>
        </Demo>
        <Demo label="Popover">
          <Popover trigger={<Button variant="secondary">Open popover</Button>} className="w-72 p-4">
            {({ close }) => (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-text">Reassign claim</p>
                <Field label="Handler">{(p) => <Input {...p} size="sm" placeholder="Search handlers" />}</Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => close()}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      close();
                      toast.success("Claim reassigned");
                    }}
                  >
                    Assign
                  </Button>
                </div>
              </div>
            )}
          </Popover>
        </Demo>
        <Demo label="Dropdown menu (↑/↓, Home/End, Enter, Esc)">
          <DropdownMenu
            placement="bottom-start"
            trigger={
              <Button variant="secondary" icon={MoreHorizontal}>
                Claim actions
              </Button>
            }
            items={[
              { type: "label", label: "ABC-MC-2026-000892" },
              { label: "Approve", icon: CircleCheck, onSelect: undoToast, shortcut: "A" },
              { label: "Reassign", icon: UserPlus, onSelect: () => toast("Reassign dialog") },
              { label: "Copy claim ID", icon: Copy, onSelect: () => toast("Copied") },
              { label: "Settle payment", icon: Wallet, disabled: true },
              { type: "separator" },
              { label: "Escalate to SIU", icon: ShieldAlert, danger: true, onSelect: () => toast.warning("Escalated to SIU") },
            ]}
          />
        </Demo>
      </div>
      <Demo label="Toasts (Sonner)">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={undoToast}>
            Success with Undo
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Couldn't save. Your change was rolled back.", { action: { label: "Retry", onClick: () => toast.success("Saved") } })}>
            Error with Retry
          </Button>
          <Button variant="secondary" onClick={() => toast.warning("You don't have access")}>
            Warning
          </Button>
          <Button variant="secondary" onClick={() => toast.info("Demo mode — AI responses are pre-recorded")}>
            Info
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.promise(new Promise((r) => setTimeout(r, 1500)), { loading: "Uploading 4 photos…", success: "Photos uploaded", error: "Upload failed" })
            }
          >
            Promise
          </Button>
        </div>
      </Demo>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Request more information"
        description="The customer receives this message in plain language."
        initialFocusRef={firstField}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModal(false);
                toast.success("Request sent to Rahul Sharma");
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="What do you need?">{(p) => <Input {...p} ref={firstField} placeholder="e.g. a clearer photo of the rear bumper" />}</Field>
          <Field label="Message to customer" hint="Avoid internal terms.">
            {(p) => <Textarea {...p} defaultValue="Could you please share a clear photo of the rear bumper in daylight?" />}
          </Field>
        </div>
      </Modal>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Reject this claim?"
        description="The customer is notified. You can undo for 6 seconds."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep claim
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirm(false);
                toast("Claim rejected", { action: { label: "Undo", onClick: () => toast.success("Rejection undone") } });
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <Caption>Reason codes are required in the real flow (Phase 3).</Caption>
      </Modal>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Claim preview" description="Drawers slide in from the side." footer={<Button onClick={() => setDrawer(false)}>Done</Button>}>
        <div className="flex flex-col gap-4 p-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-12 rounded-md bg-bg-muted" />
          ))}
        </div>
      </Drawer>
    </Section>
  );
}
