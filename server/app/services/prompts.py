"""Prompt renderer (AGENT_PROMPTS.md A2): `_shared.md` + `<agent>.md`, `{{placeholders}}` filled by Python.

Reference data goes in as compact pipe tables (`pipe_table`) holding only this claim's slice — never pretty JSON. Unknown
placeholders raise, so a typo can never silently send "{{x}}" to the model. Customer text is escaped so it cannot close the
`<customer_input>` tag it is wrapped in.
"""
from __future__ import annotations

import re
from functools import lru_cache

from ..config import PROMPTS_DIR

_VAR = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")


@lru_cache(maxsize=16)
def _template(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, variables: dict) -> str:
    def sub(m: re.Match) -> str:
        key = m.group(1)
        if key not in variables:
            raise KeyError(f"Prompt {name}.md needs {{{{{key}}}}}")
        value = variables[key]
        return "null" if value is None else str(value)

    return _template("_shared").rstrip() + "\n\n" + _VAR.sub(sub, _template(name))


def customer_text(text: str | None) -> str:
    """Untrusted text for inside <customer_input>: strip any tag that could close or reopen the wrapper."""
    return re.sub(r"</?\s*customer_input\s*>", "", text or "", flags=re.I).strip()


def cell(v) -> str:
    if v is None or v == "":
        return "-"
    if isinstance(v, bool):
        return "y" if v else "n"
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).replace("|", "/").replace("\n", " ")


def pipe_table(rows: list[dict], columns: list[str]) -> str:
    """Rows only (the header is in the template where it has one)."""
    return "\n".join("|".join(cell(r.get(c)) for c in columns) for r in rows)


def pipe_line(values: list) -> str:
    return " | ".join(cell(v) for v in values)
