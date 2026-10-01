// Style-guide-only sample data. Real claim data comes from server/data/claims.json from Phase 2 on.

const STATUSES = ["SUBMITTED", "PROCESSING", "INFO_REQUESTED", "UNDER_REVIEW", "SIU_INVESTIGATION", "APPROVED", "PREAUTH_ISSUED", "SETTLED", "DECLINED", "WITHDRAWN"];
const NAMES = ["Rahul Sharma", "Priya Nair", "Arjun Mehta", "Sneha Kulkarni", "Vikram Singh", "Ananya Iyer", "Rohan Deshmukh", "Kavya Reddy", "Imran Shaikh", "Meera Joshi", "Aditya Rao", "Pooja Patil"];
const CITIES = ["Pune", "Mumbai", "Bengaluru", "Chennai", "Delhi", "Hyderabad", "Nashik", "Ahmedabad"];
const MODELS = ["Maruti Swift", "Hyundai Creta", "Tata Nexon", "Honda Activa", "Mahindra XUV700", "Tata Ace", "Royal Enfield Classic 350", "Kia Seltos"];
const STATES = ["MH", "KA", "TN", "DL", "TS", "GJ"];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeDemoRows(count, seed = 2026) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const base = Date.parse("2026-09-30T18:00:00+05:30");
  return Array.from({ length: count }, (_, i) => {
    const st = pick(STATES);
    const reg = `${st}${String(1 + Math.floor(r() * 49)).padStart(2, "0")}${String.fromCharCode(65 + Math.floor(r() * 26))}${String.fromCharCode(65 + Math.floor(r() * 26))}${String(1000 + Math.floor(r() * 8999))}`;
    return {
      id: `ABC-MC-2026-${String(892 - i).padStart(6, "0")}`,
      customer: pick(NAMES),
      vehicle: pick(MODELS),
      registration: reg,
      city: pick(CITIES),
      status: pick(STATUSES),
      amount: Math.round((8000 + r() * 240000) / 10) * 10,
      risk: Math.floor(r() * 100),
      filedAt: new Date(base - Math.floor(r() * 90 * 86400000)).toISOString(),
    };
  });
}

/** Synthesise a short speech-like WAV (modulated tones) so the AudioPlayer can be demoed offline. */
export function makeDemoAudioUrl(seconds = 8) {
  const rate = 16000;
  const n = rate * seconds;
  const buffer = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const syllable = Math.max(0, Math.sin(t * Math.PI * 3.2)) ** 2;
    const pause = Math.sin(t * 0.9) > -0.6 ? 1 : 0.05;
    const f = 160 + 40 * Math.sin(t * 2.1);
    const s = (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2.02 * t) * 0.25) * syllable * pause * 0.35;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const IMG = "/assets/illustrations";
export const LIGHTBOX_ITEMS = [
  {
    src: `${IMG}/demo-damage-side.svg`,
    caption: "Left side — front door and rear bumper",
    alt: "Illustration of a blue hatchback, side view, with marked damage",
    reference: `${IMG}/demo-reference-side.svg`,
    annotations: [
      { x: 0.6, y: 0.44, w: 0.1, h: 0.13, label: "Front door · dent", severity: "moderate" },
      { x: 0.22, y: 0.55, w: 0.11, h: 0.1, label: "Rear bumper · scratch", severity: "minor" },
    ],
    exif: { Camera: "Demo illustration", Captured: "30 Sep 2026, 02:14 PM IST", GPS: "18.5204° N, 73.8567° E", Resolution: "960 × 600" },
  },
  {
    src: `${IMG}/demo-damage-front.svg`,
    caption: "Front three-quarter",
    alt: "Illustration of an orange hatchback with marked damage",
    annotations: [
      { x: 0.6, y: 0.44, w: 0.1, h: 0.13, label: "Headlamp · broken", severity: "severe" },
      { x: 0.22, y: 0.55, w: 0.11, h: 0.1, label: "Old scuff", severity: "pre_existing" },
    ],
    exif: { Camera: "Demo illustration", Captured: "30 Sep 2026, 02:15 PM IST" },
  },
  { src: `${IMG}/demo-damage-rear.svg`, caption: "Rear view (no AI annotations)", alt: "Illustration of a grey hatchback, rear view", exif: {} },
];
