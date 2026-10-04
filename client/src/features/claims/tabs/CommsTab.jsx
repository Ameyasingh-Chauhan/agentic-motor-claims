import { useEffect, useState } from "react";
import { Mail, MessageCircle, MessageSquare, RefreshCw, Send, Smartphone, Sparkles } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Textarea } from "../../../components/ui/Input";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { formatDateTime } from "../../../lib/format";
import { useSendMessage } from "../useClaim";

const CHANNEL = { whatsapp: { icon: MessageCircle, label: "WhatsApp" }, sms: { icon: MessageSquare, label: "SMS" }, email: { icon: Mail, label: "Email" },
  app: { icon: Smartphone, label: "App" } };

function Bubble({ m, customerName, viewer }) {
  const mine = viewer === "customer" ? m.direction === "inbound" : m.direction === "outbound";
  const ch = CHANNEL[m.channel] ?? CHANNEL.sms;
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] rounded-lg px-4 py-3 text-sm", mine ? "bg-tint-blue-bg text-text" : "border border-border bg-surface text-text")}>
        <p className="whitespace-pre-line">{m.text}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-caption text-subtle">
          <ch.icon size={12} aria-hidden="true" />{ch.label} · {m.direction === "outbound" ? "ABC General Insurance" : customerName} · {formatDateTime(m.created_at)}
        </p>
      </div>
    </li>
  );
}

function Draft({ draft, claimId }) {
  const [text, setText] = useState(draft.text);
  useEffect(() => setText(draft.text), [draft.text]);
  const send = useSendMessage(claimId);
  return (
    <Card compact className="border-blue-600" title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-tint-blue" aria-hidden="true" />Suggested reply</span>}
      actions={<Badge tone="blue">Draft</Badge>}>
      <label htmlFor="draft-text" className="sr-only">Edit the draft</label>
      <Textarea id="draft-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted">Written by the Communication agent's template · customer-safe · sent on {CHANNEL[draft.channel]?.label ?? "SMS"}</p>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" icon={RefreshCw} disabledReason="Regenerating needs the live Communication agent (Phase 5)">Regenerate draft</Button>
          <Button size="sm" icon={Send} loading={send.isPending} disabledReason={text.trim() ? undefined : "The message is empty"}
            onClick={() => send.mutate({ text: text.trim(), draft_id: draft.id })}>Send</Button>
        </span>
      </div>
    </Card>
  );
}

/** Communications tab (§10.4 C9) — also the customer's Messages tab (`viewer="customer"`: no drafts, reply box). */
export function CommsTab({ claim, viewer = "handler" }) {
  const thread = (claim.communications ?? []).filter((m) => !m.draft).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const draft = viewer === "handler" ? (claim.communications ?? []).find((m) => m.draft) : null;
  const [text, setText] = useState("");
  const send = useSendMessage(claim.id);
  const closed = claim.status === "DRAFT";
  return (
    <div className="flex flex-col gap-4">
      {thread.length === 0 ? <EmptyState compact title="No messages yet" description="Messages between ABC and the customer appear here." /> : (
        <ol className="flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-4" aria-label="Message thread">
          {thread.map((m) => <Bubble key={m.id} m={m} customerName={viewer === "customer" ? "You" : claim.customer_name} viewer={viewer} />)}
        </ol>
      )}
      {draft && <Draft draft={draft} claimId={claim.id} />}
      {!closed && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate({ text: text.trim() }, { onSuccess: () => setText("") }); }}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <label htmlFor="new-message" className="text-sm font-medium text-text">{viewer === "customer" ? "Reply to ABC" : `Message ${claim.customer_name}`}</label>
          <Textarea id="new-message" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={viewer === "customer" ? "Type your message…" : "Write a customer-safe message…"} />
          <Button type="submit" size="sm" icon={Send} loading={send.isPending} className="self-end" disabledReason={text.trim() ? undefined : "Write a message first"}>Send</Button>
        </form>
      )}
    </div>
  );
}
