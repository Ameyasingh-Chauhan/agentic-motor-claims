import { useEffect } from "react";
import { useLocation } from "react-router";

/** KPI / donut / "View all" links end in #claims: bring the filtered list into view. Renders nothing. */
export function ScrollToClaims() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash !== "#claims") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => document.getElementById("claims")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  }, [location.key, location.hash]);
  return null;
}
