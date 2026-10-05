import { toPng } from "html-to-image";

function save(name, href) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const bg = () => getComputedStyle(document.documentElement).getPropertyValue("--chat-bg").trim();

/** Current phone screen → PNG (client-side, html-to-image). The scale transform is removed for a crisp 390 × 820 capture. */
export async function phonePng(el) {
  return toPng(el, { pixelRatio: 2, backgroundColor: bg(), style: { transform: "none" } });
}

export async function downloadScreen(el, name) {
  save(`${name}.png`, await phonePng(el));
}

/** One PNG per chapter (state at the end of each chapter) + the final screen, zipped with JSZip (loaded on demand). */
export async function downloadKeyFrames(el, name, scenario, showUpTo) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const ends = scenario.chapters.map((ch, i) => ({ label: ch.label, last: (scenario.chapters[i + 1]?.index ?? scenario.messages.length) - 1 }));
  for (const [i, f] of ends.entries()) {
    showUpTo(f.last);
    await frame();
    await new Promise((r) => setTimeout(r, 300));   // let the chat scroll settle
    const png = await phonePng(el);
    zip.file(`${String(i + 1).padStart(2, "0")}-${f.label.toLowerCase()}.png`, png.split(",")[1], { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  save(`${name}-key-frames.zip`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
