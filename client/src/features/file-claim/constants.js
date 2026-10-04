import { Car, Flame, Waves, ShieldAlert, Users, PanelTop, Hammer } from "lucide-react";

/** Wizard steps (§10.6). `admin` steps are shown to admins only. */
export const STEPS = [
  { key: "policyholder", label: "Policyholder", description: "Who is claiming", admin: true },
  { key: "policy", label: "Policy & vehicle", description: "Find the cover" },
  { key: "safety", label: "Safety first", description: "Injuries, third party, police" },
  { key: "incident", label: "What happened", description: "Type it or say it" },
  { key: "when", label: "When & where", description: "Date, time, place" },
  { key: "photos", label: "Photos", description: "Guided capture" },
  { key: "documents", label: "Documents & settlement", description: "Checklist, garage or bank" },
  { key: "review", label: "Review & submit", description: "Check and confirm" },
];

export const stepsFor = (admin) => STEPS.filter((s) => admin || !s.admin);

/** Incident tiles. `accident` asks for a sub-type, which is the claim's incident type on the server. */
export const INCIDENT_TILES = [
  { key: "accident", label: "Accident", icon: Car, hint: "Collision, scrape, pothole, animal" },
  { key: "theft", label: "Theft", icon: ShieldAlert, hint: "Vehicle stolen" },
  { key: "fire", label: "Fire", icon: Flame, hint: "Fire or explosion" },
  { key: "flood", label: "Flood / natural calamity", icon: Waves, hint: "Water, storm, landslide" },
  { key: "third_party", label: "Third-party damage", icon: Users, hint: "You damaged someone else's property" },
  { key: "glass", label: "Glass only", icon: PanelTop, hint: "Windshield or windows" },
  { key: "vandalism", label: "Vandalism", icon: Hammer, hint: "Deliberate damage by others" },
];

export const ACCIDENT_TYPES = [
  { value: "rear_end", label: "Hit from behind" }, { value: "front_collision", label: "Front collision" },
  { value: "side_swipe", label: "Side impact" }, { value: "parking_scrape", label: "Parking scrape" },
  { value: "pothole", label: "Pothole / road hazard" }, { value: "animal", label: "Animal collision" },
  { value: "skid_fall", label: "Skid and fall" },
];
const ACCIDENT_KEYS = new Set(ACCIDENT_TYPES.map((a) => a.value));

/** Server incident type ↔ tile + sub-type. */
export function tileOf(type) {
  if (!type) return { tile: null, sub: null };
  return ACCIDENT_KEYS.has(type) ? { tile: "accident", sub: type } : { tile: type, sub: null };
}
export function incidentType(form) {
  if (form.incident_tile === "accident") return form.accident_type || null;
  return form.incident_tile || null;
}
export function claimTypeOf(tile) {
  return { theft: "Theft", glass: "Glass", third_party: "TP" }[tile] ?? "OD";
}

/** Intake (AGENT_PROMPTS C) incident_type → wizard tile. */
export const INTAKE_TILE = { accident: "accident", theft: "theft", fire: "fire", flood: "flood", third_party: "third_party", glass: "glass", vandalism: "vandalism" };
export const COUNTERPARTY_ACCIDENT = { truck: "rear_end", car: "front_collision", "two-wheeler": "side_swipe", object: "front_collision", pedestrian: "front_collision" };

/** Guided capture slots. `need` decides when a slot is shown. */
export const PHOTO_SLOTS = [
  { slot: "front", label: "Front", hint: "Whole front, number plate readable", shape: "front" },
  { slot: "rear", label: "Rear", hint: "Whole rear, number plate readable", shape: "rear" },
  { slot: "left", label: "Left side", hint: "Full left side, step back", shape: "side" },
  { slot: "right", label: "Right side", hint: "Full right side, step back", shape: "side-r" },
  { slot: "closeup", label: "Damage close-up", hint: "Fill the frame with the damage", shape: "closeup" },
  { slot: "closeup_2", label: "Damage close-up 2", hint: "Another angle of the damage", shape: "closeup" },
  { slot: "odometer", label: "Odometer", hint: "Dashboard with the reading visible", shape: "odometer" },
  { slot: "chassis", label: "Chassis / VIN plate", hint: "Stamped chassis number", shape: "vin", need: (f) => ["flood", "fire"].includes(f.incident_tile) },
];

export const LANGUAGE_NAMES = {
  hi: "Hindi", mr: "Marathi", en: "English", ta: "Tamil", te: "Telugu", kn: "Kannada", ml: "Malayalam", bn: "Bengali", gu: "Gujarati",
  pa: "Punjabi", or: "Odia", as: "Assamese", ur: "Urdu", "hi-en": "Hindi–English mix",
};

export const EMPTY_FORM = {
  customer_id: null, customer_name: null, policy_no: null,
  safe: null, third_party: null, tp: { name: "", vehicle: "", phone: "" }, police: null, fir_number: "", fir_station: "",
  incident_tile: null, accident_type: null, input_mode: "text", narrative: "", intake: null, ai_filled: {},
  date: "", time: "", city: "", location_text: "", road: "", lat: null, lng: null,
  settlement_mode: null, garage_id: null, garage_quote: "", bank: { account_name: "", account_last4: "", ifsc: "", bank_name: "" },
  docs_later: false, financed: false, consent: false, scenario: null, quality_ok: {},
};

export const MAX_RECORD_S = 180;
