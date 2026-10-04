/** Scroll to the evidence a flag points at and pulse an orange outline round it (claims.css). Waits briefly for a tab to render. */
export function highlightEvidence(targetId) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tries = 0;
  const run = () => {
    const el = document.getElementById(targetId);
    if (!el) {
      if (tries++ < 30) setTimeout(run, 50);
      return;
    }
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    el.classList.remove("evidence-pulse");
    void el.offsetWidth; // restart the animation if the same flag is clicked twice
    el.classList.add("evidence-pulse");
    setTimeout(() => el.classList.remove("evidence-pulse"), 1800);
  };
  run();
}
