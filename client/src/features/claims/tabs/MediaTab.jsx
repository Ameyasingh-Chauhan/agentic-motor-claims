import { useState } from "react";
import { MicOff } from "lucide-react";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { FileTile } from "../../../components/ui/FileTile";
import { AudioPlayer } from "../../../components/ui/AudioPlayer";
import { Lightbox } from "../../../components/ui/Lightbox";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Card } from "../../../components/ui/Card";
import { formatDateTime, formatDuration } from "../../../lib/format";
import { DocumentViewer } from "./DocumentsTab";

const FILTERS = [{ value: "all", label: "All" }, { value: "photo", label: "Photos" }, { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" }, { value: "document", label: "Documents" }];

function VoiceNote({ m }) {
  if (m.url && m.available !== false) {
    return <AudioPlayer src={m.url} title={`Voice note · ${formatDuration(m.duration_s)}`} language={m.language} transcript={m.transcript} translation={m.translation_en} />;
  }
  return (
    <Card compact title={`Voice note · ${formatDuration(m.duration_s)}`} subtitle={`${m.language ?? "Language unknown"} · ${formatDateTime(m.uploaded_at)}`}>
      <p className="inline-flex items-center gap-2 text-caption text-muted"><MicOff size={14} aria-hidden="true" />Audio not retained — transcript kept</p>
      {m.transcript && <p className="mt-2 text-sm text-text">{m.transcript}</p>}
      {m.translation_en && m.translation_en !== m.transcript && <p className="mt-1 text-sm text-muted">English: {m.translation_en}</p>}
    </Card>
  );
}

/** Media & Uploads tab (§10.4 C8): every file on the claim, filterable by type. Customers see their own uploads (no annotations). */
export function MediaTab({ claim, internal = true }) {
  const [filter, setFilter] = useState("all");
  const [lightbox, setLightbox] = useState(null);
  const [doc, setDoc] = useState(null);
  const media = claim.media ?? [];
  const photos = media.filter((m) => m.kind === "photo");
  const all = [
    ...media.map((m) => ({ ...m, _type: m.kind })),
    ...(claim.documents ?? []).filter((d) => d.url).map((d) => ({ ...d, _type: "document" })),
  ];
  const shown = all.filter((x) => filter === "all" || x._type === filter);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, f.value === "all" ? all.length : all.filter((x) => x._type === f.value).length]));

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl label="File type" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, label: `${f.label} · ${counts[f.value]}` }))} />
      {shown.length === 0 ? <EmptyState title="Nothing here" description={filter === "video" ? "No videos were uploaded for this claim." : "No files of this type."} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((x) => x._type === "audio" ? (
            <div key={x.id} className="sm:col-span-2 xl:col-span-3"><VoiceNote m={x} /></div>
          ) : (
            <FileTile key={x.id}
              name={x._type === "document" ? `${x.type} · ${x.id}` : `${x.slot ?? x.kind} · ${x.id}`}
              kind={x._type === "document" ? (x.thumb ? "image" : "pdf") : x._type === "photo" ? "image" : "doc"}
              thumb={x.thumb} blur={x.blur_data} size={x.size_kb ? x.size_kb * 1024 : undefined} uploadedAt={x.uploaded_at}
              flag={internal && x.quality && !x.quality.ok ? { level: "warn", label: "Low quality" } : undefined}
              onOpen={() => (x._type === "photo" ? setLightbox(photos.findIndex((p) => p.id === x.id)) : x._type === "document" ? setDoc(x) : null)} />
          ))}
        </div>
      )}
      <Lightbox open={lightbox != null} index={Math.max(0, lightbox ?? 0)} onClose={() => setLightbox(null)}
        items={photos.map((p) => ({ src: p.url, thumb: p.thumb, alt: `${p.slot ?? "Photo"} of the vehicle`, caption: `${p.id} · ${p.slot ?? "photo"}`,
          exif: { Captured: formatDateTime(p.exif?.captured_at), Device: p.exif?.device ?? "—", Resolution: p.width ? `${p.width} × ${p.height}` : "—" } }))} />
      <DocumentViewer doc={doc} onClose={() => setDoc(null)} internal={internal} />
    </div>
  );
}
