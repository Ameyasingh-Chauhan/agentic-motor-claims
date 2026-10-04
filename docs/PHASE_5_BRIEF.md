========== PHASE 5 BRIEF ==========
Build Phase 5 (Agents & pipeline). docs/AGENT_PROMPTS.md is the source of truth for all prompts, the call plan, token rules, adjudication policy, vehicle identity and new rules FR-16 to FR-18; where it differs from BUILD_SPEC §15–16 it wins (update BUILD_SPEC to reference it). Also read BUILD_SPEC sections 13, 14, 15 and 11.6. Do not re-run the full seed (~17 min) unless truly required; tell me first if so.

Build:
1. services/gemini.py: google-genai in Vertex mode using the key file from .env (GOOGLE_APPLICATION_CREDENTIALS, project from the key file, location global, GEMINI_MODEL); structured output with Pydantic schemas; retries/backoff; schema-retry; fallback; token + latency logging; images sent as WebP ≤1280px.
2. server/prompts/*.md exactly as in AGENT_PROMPTS.md Parts B–G, with a small renderer for {{placeholders}} and compact pipe-table injection of only this claim's reference data.
3. Agents + orchestrator per AGENT_PROMPTS.md A1: Intake, Document, Verification (Python), Damage & vehicle identity, Fraud (DMN + investigation call), Adjudication (Python policy A5 + same call), Communication. Document, Verification and Damage run in parallel. Python computes all money (costing.py), scores (dmn_engine.py with FR-16–18 added), routing and vehicle-identity comparisons (A4).
4. SSE pipeline events per BUILD_SPEC §15.4, persisted in pipeline_runs.json with Last-Event-ID replay; presentation pacing via PIPELINE_MIN_STEP_MS.
5. Attach the pipeline to POST /api/claims/{id}/submit. Results are written into the claim per the §11.6 persistence contract, so the claim renders fully in Claim Detail (all tabs, plus a new Vehicle identity card in the Damage and Verification tabs) and is counted on Home immediately.
6. Demo mode: when the key file is missing or LLM_MODE=demo, use demo_fallback/ outputs (schema-valid fallbacks for the 5 scenarios and a generic one), with the yellow "Demo mode" badge for admins.
7. Dev Tools: LLM mode switch, a "Test Vertex connection" button, a pipeline run inspector (events, rendered prompts, raw responses, tokens, latency). "Create sample in-app claim" also runs the pipeline.
8. Enable "Regenerate draft" on the Communications tab via the Communication agent.

Acceptance:
- With the key present, the Dev Tools sample claim runs the full pipeline live and opens with real AI results: photos with boxes, vehicle identity (consistent), financial ladder, fraud score with evidence, decision, customer message.
- A test claim whose photos show a different vehicle than the insured one fires FR-16/FR-17.
- With the key removed (or LLM_MODE=demo), demo mode completes without errors.
- Killing the browser mid-run and reopening replays/resumes; a forced agent failure shows retry then fallback without hanging.
- Tests (Gemini mocked): costing still exact, FR-16–18, adjudication policy branches, vehicle identity comparison, schema validation and fallback. pytest -v, npm run build, npm run contrast pass.
Report total Gemini tokens per claim run. Stop at the end of Phase 5 with a summary, an honest list of anything incomplete, and a test checklist. Do not commit.
====================================
