// Contrast check for both themes, read straight from src/styles/tokens.css.
// Usage: npm run contrast   (exits 1 if any pair fails)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluatePairs } from "../src/lib/contrast.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "src/styles/tokens.css"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error(`Selector not found: ${selectorStart}`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("}", open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const light = block(':root,\n[data-theme="light"]');
const dark = { ...light, ...block('[data-theme="dark"] {') };

function resolver(vars) {
  const get = (name, depth = 0) => {
    const v = vars[name];
    if (v == null) throw new Error(`Missing token ${name}`);
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    return ref && depth < 8 ? get(ref[1], depth + 1) : v;
  };
  return get;
}

let failed = 0;
for (const [name, vars] of [["light", light], ["dark", dark]]) {
  console.log(`\n${name.toUpperCase()} THEME`);
  for (const r of evaluatePairs(resolver(vars))) {
    if (!r.pass) failed += 1;
    console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.ratio.toFixed(2).padStart(5)} : 1  (min ${r.min})  ${r.label}  [${r.fg} on ${r.bg}]`);
  }
}
console.log(failed ? `\n${failed} contrast check(s) failed.` : "\nAll contrast checks passed.");
process.exit(failed ? 1 : 0);
