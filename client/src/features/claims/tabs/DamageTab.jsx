import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Circle, Hourglass, Maximize2, ScanSearch } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Switch } from "../../../components/ui/Checkbox";
import { StatusFlag } from "../../../components/ui/StatusFlag";
import { Lightbox } from "../../../components/ui/Lightbox";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { formatDateTime } from "../../../lib/format";
import { AnnotatedImage, BOX_TONE, Photo, toRect } from "../parts";

const SLOTS = [["front", "Front"], ["rear", "Rear"], ["left", "Left"], ["right", "Right"], ["closeup", "Close-up"], ["odometer", "Odometer"]];
const MAX_H = 448; // 28rem — main photo height cap

function km(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const r = 6371, p = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * p) / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(((b.lng - a.lng) * p) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Boxes on a photo: one per damage item / pre-existing finding, coloured green / amber / red. */
function boxesFor(claim, photoId) {
  const out = [];
  for (const it of claim.damage?.items ?? []) {
    const tone = !it.fresh ? "old" : it.flag === "warn" || it.confidence < 0.75 ? "review" : "fresh";
    for (const b of it.boxes ?? []) {
      if (b.photo_id !== photoId) continue;
      out.push({ box_2d: b.box_2d, tone, label: `${it.part} · ${it.damage_type} · ${it.severity} · ${Math.round(it.confidence * 100)}%` });
    }
  }
  for (const pe of claim.damage?.pre_existing ?? []) {
    for (const b of pe.boxes ?? []) {
      if (b.photo_id === photoId && !out.some((o) => o.box_2d.join() === b.box_2d.join())) {
        out.push({ box_2d: b.box_2d, tone: "old", label: `${pe.part} · pre-existing · ${Math.round(pe.confidence * 100)}%` });
      }
    }
  }
  return out;
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Damage tab (§10.4 C3). */
export function DamageTab({ claim }) {
  const photos = claim.media.filter((m) => m.kind === "photo");
  const analysed = Boolean(claim.fraud) && (claim.damage?.items?.length ?? 0) > 0;
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const boxRef = useRef(null);
  const cw = useWidth(boxRef);
  const current = photos[index];
  const boxes = useMemo(() => (current && analysed ? boxesFor(claim, current.id) : []), [claim, current, analysed]);

  const size = useMemo(() => {
    if (!current?.width || !cw) return { width: "100%", height: MAX_H };
    const ratio = current.width / current.height;
    const width = Math.min(cw, MAX_H * ratio);
    return { width, height: width / ratio };
  }, [current, cw]);

  const items = photos.map((p) => ({
    src: p.url, thumb: p.thumb, alt: `${p.slot ?? "Photo"} of the vehicle`,
    caption: `${p.id} · ${p.slot ?? "photo"}${p.caption ? ` — ${p.caption}` : ""}`,
    annotations: analysed ? boxesFor(claim, p.id).map((b) => ({ ...toRect(b.box_2d), label: b.label, severity: b.tone })) : [],
    exif: {
      Captured: formatDateTime(p.exif?.captured_at), GPS: p.exif?.lat != null ? `${p.exif.lat}, ${p.exif.lng}` : "—", Device: p.exif?.device ?? "—",
      Resolution: p.width ? `${p.width} × ${p.height}` : "—", Credit: p.credit?.author ?? (claim.origin === "app" ? "Uploaded by the customer" : "—"),
    },
  }));

  const coverage = claim.damage?.photo_coverage && Object.keys(claim.damage.photo_coverage).length
    ? claim.damage.photo_coverage
    : Object.fromEntries(SLOTS.map(([k]) => [k, photos.some((p) => p.slot === k)]));
  const incidentAt = new Date(claim.incident.datetime).getTime();
  const reportedAt = new Date(claim.incident.reported_at ?? claim.created_at).getTime();

  if (!photos.length) {
    return <EmptyState title="No photos on this claim" description={claim.claim_type === "Theft" ? "Theft claims are assessed from documents; the vehicle is not available to photograph." : "The customer has not uploaded photos yet."} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {!analysed && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-tint-blue-bg px-4 py-3 text-sm text-text">
          <Hourglass size={18} className="mt-0.5 shrink-0 text-tint-blue" aria-hidden="true" />
          <div>
            <p className="font-semibold">AI assessment pending</p>
            <p className="text-muted">Photos are shown as uploaded. The Damage agent adds part-level boxes, severity and repair/replace calls when the pipeline runs.</p>
          </div>
        </div>
      )}

      <Card compact title="Photos" subtitle={`${photos.length} photo${photos.length === 1 ? "" : "s"}`}
        actions={analysed ? <Switch label="Annotations" checked={show} onChange={setShow} /> : null}>
        <div ref={boxRef} className="flex justify-center">
          <button type="button" onClick={() => setLightbox(index)} className="group relative rounded-md focus-visible:outline-2 focus-visible:outline-focus"
            style={{ width: size.width, height: size.height }} aria-label="Open the photo viewer">
            <AnnotatedImage src={current.url} blur={current.blur_data} alt={`${current.slot ?? "Photo"} of the vehicle`} boxes={boxes} show={show}
              className="h-full w-full rounded-md" />
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-sm bg-panel-dark/80 px-2 py-1 text-caption text-on-dark opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <Maximize2 size={14} aria-hidden="true" /> Open viewer
            </span>
          </button>
        </div>
        {analysed && show && (
          <ul className="mt-3 flex flex-wrap gap-4 text-caption text-muted" aria-label="Annotation colours">
            {Object.entries(BOX_TONE).map(([k, t]) => (
              <li key={k} className="inline-flex items-center gap-1"><span className={cn("h-3 w-3 rounded-sm border-2", t.border)} aria-hidden="true" />{t.label}</li>
            ))}
          </ul>
        )}
        {photos.length > 1 && (
          <ul className="mt-4 grid grid-cols-4 gap-3 md:grid-cols-6">
            {photos.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => setIndex(i)} aria-pressed={i === index} aria-label={`Show ${p.slot ?? "photo"} ${i + 1}`}
                  className={cn("block w-full overflow-hidden rounded-md border-2 transition-colors duration-150", i === index ? "border-primary" : "border-transparent hover:border-border-strong")}>
                  <Photo src={p.thumb ?? p.url} blur={p.blur_data} alt="" className="aspect-4/3 w-full" imgClassName="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {analysed ? (
        <Card compact title="Damage assessment" subtitle={`${claim.damage.items.length} part(s) · overall ${claim.damage.overall_severity}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-caption text-muted">
                <tr className="border-b border-border">
                  {["Part", "Location", "Damage", "Severity", "Fresh / old", "Repair or replace", "Confidence", "Flag"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {claim.damage.items.map((it, i, all) => (
                  <tr key={`${it.part_code}-${i}`} id={all.findIndex((x) => x.part_code === it.part_code) === i ? `damage-${it.part_code}` : undefined} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 text-text">{it.part}<div className="mono text-caption text-subtle">{it.part_code}</div></td>
                    <td className="px-2 py-2 capitalize text-muted">{it.zone}</td>
                    <td className="px-2 py-2 text-text">{it.damage_type}</td>
                    <td className="px-2 py-2 capitalize text-text">{it.severity}</td>
                    <td className="px-2 py-2"><StatusFlag size="sm" level={it.fresh ? "pass" : "fail"} label={it.fresh ? "Fresh" : "Pre-existing"} /></td>
                    <td className="px-2 py-2 text-text">{it.operation.replaceAll("_", " ")}</td>
                    <td className="num px-2 py-2 text-text">{Math.round(it.confidence * 100)}%</td>
                    <td className="px-2 py-2">
                      {it.flag === "pass" ? <StatusFlag size="sm" level="pass" label="OK" />
                        : <StatusFlag size="sm" level={it.flag} label={it.flag === "fail" ? "Pre-existing" : (it.flag_note ?? "Needs human review")} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {claim.damage.narrative_consistency?.explanation && (
            <div id="narrative" className="mt-4 rounded-md border border-border px-3 py-2 text-sm">
              <StatusFlag size="sm" level={claim.damage.narrative_consistency.consistent ? "pass" : "warn"}
                label={claim.damage.narrative_consistency.consistent ? "Narrative consistent with damage" : "Narrative inconsistent with damage"} />
              <p className="mt-2 text-text">{claim.damage.narrative_consistency.explanation}</p>
            </div>
          )}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card compact title="Photo quality & coverage">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {SLOTS.map(([k, label]) => (
              <li key={k} className="inline-flex items-center gap-2">
                {coverage[k] ? <CheckCircle2 size={16} className="text-success" aria-hidden="true" /> : <Circle size={16} className="text-subtle" aria-hidden="true" />}
                <span className={coverage[k] ? "text-text" : "text-muted"}>{label}</span>
                <span className="sr-only">{coverage[k] ? "covered" : "missing"}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm">
            {photos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-text"><Camera size={16} className="text-subtle" aria-hidden="true" />{p.id} · {p.slot ?? "photo"}</span>
                {p.quality ? <StatusFlag size="sm" level={p.quality.ok ? "pass" : "warn"} label={`Sharpness ${Math.round(p.quality.blur_score)} · light ${Math.round(p.quality.brightness * 100)}%`} />
                  : <StatusFlag size="sm" level="pending" label="Not measured" />}
              </li>
            ))}
          </ul>
        </Card>

        <Card compact title="Photo metadata (EXIF)" subtitle="Compared with the reported time and place">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-caption text-muted"><tr className="border-b border-border">
                {["Photo", "Captured", "Device", "Time", "Place"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {photos.map((p) => {
                  const t = p.exif?.captured_at ? new Date(p.exif.captured_at).getTime() : null;
                  const timeOk = t != null && t >= incidentAt - 30 * 60_000 && t <= Math.max(reportedAt, incidentAt) + 48 * 3_600_000;
                  const dist = km(p.exif, claim.incident.location);
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="mono px-2 py-2 text-text">{p.id}</td>
                      <td className="px-2 py-2 text-text">{formatDateTime(p.exif?.captured_at)}</td>
                      <td className="px-2 py-2 text-muted">{p.exif?.device ?? "—"}</td>
                      <td className="px-2 py-2">{t == null ? <StatusFlag size="sm" level="pending" label="No time" /> : <StatusFlag size="sm" level={timeOk ? "pass" : "fail"} label={timeOk ? "Matches" : "Before the incident"} />}</td>
                      <td className="px-2 py-2">{dist == null ? <StatusFlag size="sm" level="pending" label="No GPS" />
                        : <StatusFlag size="sm" level={dist <= 10 ? "pass" : dist <= 30 ? "warn" : "fail"} label={`${dist < 1 ? "<1" : Math.round(dist)} km away`} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {analysed && <p className="mt-3 inline-flex items-center gap-1 text-caption text-muted"><ScanSearch size={14} aria-hidden="true" />The viewer's EXIF panel (I) shows the raw values.</p>}
        </Card>
      </div>

      <Lightbox open={lightbox != null} index={lightbox ?? 0} items={items} onClose={() => setLightbox(null)} />
    </div>
  );
}
