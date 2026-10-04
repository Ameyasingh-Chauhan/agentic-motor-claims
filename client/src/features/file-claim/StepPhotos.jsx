import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, CircleAlert, ImageUp, RefreshCcw, Trash2, TriangleAlert, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatBytes } from "../../lib/format";
import { Button, IconButton } from "../../components/ui/Button";
import { StatusFlag } from "../../components/ui/StatusFlag";
import { CaptureModal } from "./CaptureModal";
import { Silhouette } from "./Silhouette";
import { checkQuality, useUploads } from "./uploads";
import { photosOf, visibleSlots } from "./rules";

function Ring({ value }) {
  const r = 16, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-on-dark-muted" opacity="0.4" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
    </svg>
  );
}

function Slot({ slot, media, pending, quality, twoWheeler, onFile, onCamera, onRemove, onKeep }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const poor = media && quality?.poor && quality.kept !== true;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={cn("flex flex-col overflow-hidden rounded-lg border bg-surface transition-colors duration-150",
        over ? "border-primary" : poor ? "border-warning" : media ? "border-border" : "border-dashed border-border-strong")}>
      <div className="relative aspect-[4/3] bg-bg-subtle">
        {media ? (
          <img src={media.thumb || media.url} alt={`${slot.label} photo`} className="h-full w-full object-cover" />
        ) : pending?.preview ? (
          <img src={pending.preview} alt="" className="h-full w-full object-cover opacity-60" />
        ) : (
          <Silhouette shape={slot.shape} twoWheeler={twoWheeler} className="absolute inset-6 text-border-strong" />
        )}
        {pending?.status === "uploading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-overlay">
            <Ring value={pending.progress} /><span className="num text-caption font-medium text-on-dark">{pending.progress}%</span>
          </div>
        )}
        {pending?.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-overlay p-3 text-center">
            <CircleAlert size={20} className="text-on-dark" aria-hidden="true" /><span className="text-caption text-on-dark">{pending.error}</span>
          </div>
        )}
        {media && !poor && <StatusFlag size="sm" level="pass" label="Uploaded" className="absolute top-2 left-2" />}
        {media && <IconButton icon={Trash2} label={`Remove ${slot.label} photo`} size="sm" variant="secondary" tooltip={false} className="absolute top-2 right-2" onClick={onRemove} />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-sm font-medium text-text">{slot.label}</p>
          <p className="text-caption text-muted">{slot.hint}</p>
        </div>
        <AnimatePresence>
          {poor && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 rounded-md bg-warning-bg p-2" role="alert">
              <span className="flex items-center gap-1 text-caption font-medium text-warning"><TriangleAlert size={14} aria-hidden="true" />{quality.reason} — retake?</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={RefreshCcw} onClick={onCamera}>Retake</Button>
                <Button size="sm" variant="ghost" onClick={onKeep}>Keep</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!media && pending?.status !== "uploading" && (
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Camera} onClick={onCamera}>Camera</Button>
            <Button size="sm" variant="ghost" icon={ImageUp} onClick={() => input.current?.click()}>Upload</Button>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

export function StepPhotos({ form, update, claim, draftId, refresh, errors }) {
  const { items, start } = useUploads();
  const [camera, setCamera] = useState(null);
  const videoInput = useRef(null);
  const twoWheeler = claim?.vehicle?.type === "2W";
  const photos = photosOf(claim);
  const video = (claim?.media ?? []).find((m) => m.kind === "video");
  const pendingFor = (slot) => Object.values(items).filter((i) => i.claimId === draftId && i.slot === slot).at(-1);

  const upload = async (slot, file, existing) => {
    if (existing) await remove(existing, true);
    const quality = file.type.startsWith("image/") ? await checkQuality(file) : null;
    start(draftId, file, { kind: "photo", slot: slot.slot, caption: slot.label }, (res, err) => {
      if (err) { toast.error(`${slot.label}: ${err}`); return; }
      if (quality) update((f) => ({ quality_ok: { ...f.quality_ok, [res.id]: { ...quality, kept: !quality.poor } } }));
      refresh();
    });
  };
  const remove = async (m, silent) => {
    try {
      await api(`/uploads/${draftId}/${m.id}`, { method: "DELETE" });
      refresh();
    } catch (e) { if (!silent) toast.error(e.message || "Could not remove the photo"); }
  };
  const uploadVideo = (file) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      if (v.duration > 31) { toast.error("Please keep the video under 30 seconds"); return; }
      start(draftId, file, { kind: "video", slot: "walkaround", caption: "Walk-around video" }, (res, err) => (err ? toast.error(err) : refresh()));
    };
    v.onerror = () => toast.error("That video can't be read");
    v.src = URL.createObjectURL(file);
  };

  const slots = visibleSlots(form);
  const bySlot = Object.fromEntries(photos.map((m) => [m.slot, m]));
  const extra = photos.filter((m) => !slots.some((s) => s.slot === m.slot));
  const done = slots.filter((s) => bySlot[s.slot]).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{form.incident_tile === "theft" ? "Photos are optional for a theft claim — add any you have (e.g. where it was parked)." : "Add as many angles as you can. At least one photo of the damage is needed."}</p>
        <span className="num text-sm font-medium text-text">{done} of {slots.length} angles</span>
      </div>
      {errors.photos && <p className="text-caption text-danger" role="alert">{errors.photos}</p>}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {slots.map((s) => (
          <Slot key={s.slot} slot={s} media={bySlot[s.slot]} pending={pendingFor(s.slot)} quality={bySlot[s.slot] && form.quality_ok[bySlot[s.slot].id]} twoWheeler={twoWheeler}
            onFile={(f) => upload(s, f, bySlot[s.slot])} onCamera={() => setCamera(s)} onRemove={() => remove(bySlot[s.slot])}
            onKeep={() => update((f) => ({ quality_ok: { ...f.quality_ok, [bySlot[s.slot].id]: { ...f.quality_ok[bySlot[s.slot].id], kept: true } } }))} />
        ))}
      </div>
      {extra.length > 0 && <p className="text-caption text-muted">Also attached: {extra.map((m) => m.caption || m.slot).join(", ")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <Video size={20} className="text-muted" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text">Short walk-around video (optional)</p>
            <p className="text-caption text-muted">{video ? `Uploaded · ${formatBytes(video.size_bytes)}` : "Up to 30 seconds"}</p>
          </div>
        </div>
        {video ? <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(video)}>Remove</Button>
          : pendingFor("walkaround")?.status === "uploading" ? <span className="num text-sm text-muted">Uploading {pendingFor("walkaround").progress}%</span>
          : <Button size="sm" variant="secondary" icon={ImageUp} onClick={() => videoInput.current?.click()}>Add video</Button>}
        <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = ""; }} />
      </div>
      {camera && <CaptureModal slot={camera} twoWheeler={twoWheeler} onClose={() => setCamera(null)} onCapture={(f) => { upload(camera, f, bySlot[camera.slot]); setCamera(null); }} />}
    </div>
  );
}
