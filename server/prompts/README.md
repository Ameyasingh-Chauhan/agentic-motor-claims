# Agent prompts

Copied verbatim from `docs/AGENT_PROMPTS.md` Parts B–H (the source of truth). `_shared.md` is prepended to every prompt.
`{{placeholders}}` are filled by `app/services/prompts.py`; reference data is injected as compact pipe tables containing only
this claim's slice. Customer text is always wrapped in `<customer_input>` tags by the template. Edit AGENT_PROMPTS.md first,
then copy the block here.
