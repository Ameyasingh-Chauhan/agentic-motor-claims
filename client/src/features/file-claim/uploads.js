import { create } from "zustand";

/**
 * Background uploads (§10.6 step 5/6): an upload keeps going when the user moves to another step; progress is kept here, outside
 * any step component. Each entry: { id, claimId, slot, kind, name, preview, progress, status: uploading|done|error, error, result }.
 */
export const useUploads = create((set, get) => ({
  items: {},
  start(claimId, file, { kind, slot, caption }, onDone) {
    const id = `${slot}-${Date.now()}`;
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    set((s) => ({ items: { ...s.items, [id]: { id, claimId, slot, kind, name: file.name, preview, progress: 0, status: "uploading" } } }));
    const patch = (p) => set((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], ...p } } } : s));
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("kind", kind);
    if (slot) form.append("slot", slot);
    if (caption) form.append("caption", caption);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads/${encodeURIComponent(claimId)}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && patch({ progress: Math.round((e.loaded / e.total) * 95) });
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        patch({ progress: 100, status: "done", result: body });
        onDone?.(body, null);
        setTimeout(() => get().clear(id), 400);
      } else {
        const msg = typeof body?.detail === "string" ? body.detail : body?.detail?.message || "Upload failed";
        patch({ status: "error", error: msg });
        onDone?.(null, msg);
      }
    };
    xhr.onerror = () => { patch({ status: "error", error: "Network error — check your connection and retry" }); onDone?.(null, "network"); };
    xhr.send(form);
    return id;
  },
  clear(id) {
    const it = get().items[id];
    if (it?.preview) setTimeout(() => URL.revokeObjectURL(it.preview), 2000);
    set((s) => { const items = { ...s.items }; delete items[id]; return { items }; });
  },
}));

export const uploadingFor = (items, claimId) => Object.values(items).some((i) => i.claimId === claimId && i.status === "uploading");

/** Client-side quality check: variance of the Laplacian (blur) and mean luminance on a 360 px copy. */
export async function checkQuality(file) {
  try {
    const bmp = await createImageBitmap(file);
    const w = 360, h = Math.max(1, Math.round((bmp.height / bmp.width) * w));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) { gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; sum += gray[j]; }
    let n = 0, mean = 0, m2 = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        const lap = gray[k - w] + gray[k + w] + gray[k - 1] + gray[k + 1] - 4 * gray[k];
        n++; const d = lap - mean; mean += d / n; m2 += d * (lap - mean);
      }
    }
    const blur = n > 1 ? m2 / (n - 1) : 0;
    const brightness = sum / (w * h) / 255;
    const reason = blur < 60 ? "Looks blurry" : brightness < 0.18 ? "Looks too dark" : brightness > 0.92 ? "Looks over-exposed" : null;
    return { blur: Math.round(blur), brightness: Math.round(brightness * 100) / 100, poor: Boolean(reason), reason };
  } catch {
    return { poor: false, reason: null };
  }
}
