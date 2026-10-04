/** Agent Theatre presentation data (§10.7). The checking lists describe what each agent's instructions ask it to do
 * (server/prompts/*.md and the Python steps) — shown while the agent works so a ~40 s live run is never a blank wait. */
export const TOOL_LABEL = {
  policy_core: "ABC policy core", vahan: "Vahan API", fastag: "NPCI FASTag", iib: "IIB history", police: "Police records",
  ckyc: "CKYC registry", dmn_engine: "DMN rules engine",
};

export const CHECKING = {
  intake: ["Detecting the language", "Transcribing and translating the statement", "Resolving the date and time", "Normalising the damaged parts", "Listing anything still missing"],
  document: ["Classifying each document", "Reading the RC: owner, registration, chassis", "Checking the licence is valid for this vehicle class", "Looking for signs of tampering", "Matching names and numbers to the policy"],
  verification: ["Policy active on the incident date?", "RC record on Vahan", "FASTag toll and parking events near the incident", "IIB claims history", "Stolen-vehicle and FIR records", "KYC status"],
  damage: ["Identifying make and model from badges, grille and lamps", "Reading the number plate", "Checking every photo shows the same vehicle", "Locating damaged parts and severity", "Choosing repair or replace from the catalogue", "Checking the damage fits the customer's story", "Python pricing every part (₹)"],
  fraud: ["Scoring 18 DMN rules", "Weighing evidence for each fired rule", "Writing the investigator summary"],
  adjudication: ["Applying the decision policy", "Checking coverage and exclusions", "Checking documents are complete", "Choosing the route"],
  communication: ["Choosing the customer's language", "Writing a clear, kind update", "Checking the message is customer-safe"],
};

export const CUSTOMER_CHECKING = {
  intake: ["Reading your claim details", "Understanding what happened"],
  document: ["Checking your documents", "Confirming the details match"],
  verification: ["Confirming your policy", "Checking your vehicle details"],
  damage: ["Looking at your photos", "Assessing the damage", "Estimating the repair"],
  fraud: ["Running final checks"],
  adjudication: ["Preparing the outcome"],
  communication: ["Writing your update"],
};

export const CUSTOMER_TEXT = {
  intake: "Reading your claim", document: "Checking your documents", verification: "Confirming your policy",
  damage: "Assessing the damage", fraud: "Final checks", adjudication: "Preparing the outcome", communication: "Preparing your update",
};

/** Same projection the server applies for customers (routers/pipeline.py `customer_safe`), used for the admin "Customer view". */
export function customerSafe(ev) {
  const { event: e, data: d } = ev;
  if (e === "run_started") return { ...ev, data: { run_id: d.run_id, claim_id: d.claim_id, pace: d.pace, ts: d.ts } };
  if (e === "agent_started") return { ...ev, data: { agent: d.agent, display_name: CUSTOMER_TEXT[d.agent], stage: d.stage, ts: d.ts } };
  if (e === "agent_completed") return { ...ev, data: { agent: d.agent, level: "pass", summary: "Done", duration_ms: d.duration_ms, ts: d.ts } };
  if (e === "decision") return { ...ev, data: { customer_message: d.customer_message, ts: d.ts } };
  if (e === "run_completed" || e === "run_failed") return { ...ev, data: { run_id: d.run_id, claim_id: d.claim_id, duration_ms: d.duration_ms, ts: d.ts } };
  return null;
}

/** Layout of the canvas: rows top→bottom; the three parallel lanes share row 2. */
export const ROWS = [["intake"], ["document", "verification", "damage"], ["fraud"], ["adjudication"], ["communication"]];
export const EDGES = [["intake", "document"], ["intake", "verification"], ["intake", "damage"], ["document", "fraud"], ["verification", "fraud"],
  ["damage", "fraud"], ["fraud", "adjudication"], ["adjudication", "communication"]];

export const ROUTE_TONE = { auto: "success", handler: "warning", SIU: "danger" };
export const ROUTE_TEXT = { auto: "Straight-through: decided automatically", handler: "Routed to a claims handler", SIU: "Referred to the Special Investigation Unit" };
