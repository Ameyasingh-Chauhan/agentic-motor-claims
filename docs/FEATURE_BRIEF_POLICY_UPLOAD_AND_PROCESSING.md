# Feature Brief — Policy From Uploaded Document & Send Existing Claims For AI Processing

Saved verbatim from user instruction on 2026-10-05. This is the authoritative spec for this
feature pair. Track progress against this file from `docs/PROGRESS.md`'s Resume point.

---

Build two features in one go. FIRST save this brief verbatim to docs/FEATURE_BRIEF_POLICY_UPLOAD_AND_PROCESSING.md and reference it from the Resume point. Follow AGENTS.md (usage-safe method: small sub-steps, app runnable after each, Resume point updated after each) and the §11.6 persistence contract. Reuse the existing Phase 5 pipeline, Document agent, Agent Theatre and Claim Detail; no duplicate logic. Do not re-seed. Do not commit.

==================================================
FEATURE A — POLICY FROM UPLOADED DOCUMENT (File a Claim wizard)
==================================================
1. Wizard Step 1: when policy lookup (by policy number or registration) finds nothing, show "Policy not found — upload your policy document" (image or PDF). Also offer it as a secondary option even when lookup works.
2. On upload, run the Document agent (existing document.md prompt and schema; extend POLICY extraction to include: insured name, father's name, address, contact, policy no, period from/to, cover type, IDV, NCB, add-ons incl. zero-dep, compulsory and voluntary deductible, premium, and vehicle make, model/variant, colour, registration, cc, fuel, year, chassis/engine last digits).
3. Show an "Extracted policy" card with every field, its confidence, amber highlight for anything below 0.75; all fields editable; a Confirm button.
4. On confirm, create customer + vehicle + policy records through json_store using the existing schemas, with source "uploaded_document"; store the document privately in server/uploads/<claim_id>/ and attach it to the claim's documents (type POLICY). If the policy number already exists with different details, block with a clear message (possible duplicate/forgery) and offer the existing policy instead. Map the vehicle to the parts catalogue model (e.g. Kia Seltos → KIA-SEL) so costing works; if the model isn't in the catalogue, add it with segment-derived prices per §12 and pin them.
5. Validation before continuing: policy active on the incident date and cover includes OD (otherwise show the reason clearly; the claim can still be filed and adjudication rule 1 will decline it).
6. Mock DPI for registrations created this way: deterministic clean records derived from the extracted policy (Vahan owner = insured, IIB clean, no police record, no FASTag events). Ensure FR-01 treats "no FASTag records" as neutral (no points).
7. Claim Detail: an info flag (blue/grey, 0 points) "Policy verified from uploaded document", shown in the flags strip, Overview policy card and Verification tab; recorded in the timeline and audit log. Never presented to customers as a concern.
8. Works for admins (for a selected or new policyholder) and customers (creates/links their own customer record).

==================================================
FEATURE B — SEND EXISTING CLAIMS FOR AI PROCESSING
==================================================
1. Admin action "Run AI processing" on Claim Detail for any claim that has no AI assessment: status SUBMITTED or any claim showing "AI assessment pending", any claim with no completed pipeline run AND missing AI results (damage assessment, financials, fraud or decision). Example: claim ABC-MC-2026-000251 (filed in Stage 2 before the pipeline existed) must get this button.
2. "Re-run AI processing" for claims whose last pipeline run failed, timed out, or used a fallback/demo output for any agent.
3. Clicking it: confirmation modal (explains what will run and that results will be written to the claim), then starts the existing orchestrator for that claim (same code path as POST /api/claims/{id}/submit) using the claim's existing uploaded photos, documents and narrative, and navigates to the Agent Theatre at /processing/:claimId. On completion, results are written per §11.6 and the claim updates instantly on Home, Claim Detail and the Dashboard.
4. Also expose it: (a) in the Home claims list row "⋯" menu for eligible claims, (b) an "AI pending" filter chip/option on Home listing all eligible claims, and (c) a "Process all pending (N)" button for admins on that filtered view, which runs them one after another (queued, with progress) rather than all at once.
5. Not available: on seeded historical claims that already have AI results, on claims currently processing (show "Processing…" and a link to the Theatre instead), and on final statuses (SETTLED, WITHDRAWN, FRAUD_CONFIRMED); disabled with a tooltip explaining why. Customers never see these buttons.
6. Record "AI processing started by <user>" (and re-runs with the reason) in the timeline and audit log. If a claim has no photos or no narrative, still run, but the pipeline must handle missing inputs gracefully (route to handler with a clear reason), never crash.

==================================================
TESTS & ACCEPTANCE
==================================================
- Backend tests (isolated data fixture, Gemini mocked): Feature A extraction → confirm → records created; duplicate policy number blocked; inactive policy path; the new claim runs the full pipeline. Feature B allowed/blocked statuses, audit entries, pipeline triggered via the shared code path, queue for "Process all pending", graceful handling of missing inputs.
- Browser check: open claim 251 → Run AI processing → Theatre runs live → results appear with photos, vehicle identity, financials, fraud score and decision, and Home updates. File a new claim using only an uploaded policy document (use the specimen policy schedule for Rohit Meena, ABC/PC/2025/604821, Kia Seltos RJ 45 CM 4821) and confirm the extracted card and the info flag.
- pytest -v, npm run build, npm run contrast pass; both themes; no console errors. Restore server/data and server/uploads after your own browser testing.

Stop with a summary, an honest list of anything incomplete, and a test checklist.
