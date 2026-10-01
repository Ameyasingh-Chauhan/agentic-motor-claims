import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { ThemePreview } from "./sections/ThemePreview";
import { Foundations } from "./sections/Foundations";
import { Buttons, Flags, Forms } from "./sections/Controls";
import { Cards, TabsDemo, Overlays } from "./sections/Containers";
import { Feedback } from "./sections/Feedback";
import { DataDisplay, TableDemo } from "./sections/DataDisplay";
import { Media } from "./sections/Media";
import { ChartDemo } from "./sections/ChartDemo";
import { cn } from "../../lib/cn";

const TOC = [
  ["themes", "Themes"],
  ["foundations", "Foundations"],
  ["charts", "Charts & reflow"],
  ["buttons", "Buttons"],
  ["flags", "Flags & badges"],
  ["forms", "Forms"],
  ["cards", "Cards & collapsibles"],
  ["tabs", "Tabs"],
  ["overlays", "Overlays & toasts"],
  ["feedback", "Data states"],
  ["data-display", "Data display"],
  ["table", "Data table"],
  ["media", "Media"],
];

/** Developer-only style guide (§7): every component in every state. */
export default function StyleguidePage() {
  const [active, setActive] = useState(TOC[0][0]);

  useEffect(() => {
    const els = TOC.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Developer"
        title="Style guide"
        description="Design tokens and the shared component library in all states. Toggle dark mode from the Topbar and collapse the sidebar (Ctrl+B) to check reflow."
      />
      <div className="grid grid-cols-12 gap-6">
        <nav aria-label="Style guide sections" className="col-span-2 hidden 2xl:block">
          <ul className="sticky top-20 flex flex-col gap-1">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
                  }}
                  aria-current={active === id ? "true" : undefined}
                  className={cn(
                    "block rounded-sm px-3 py-1 text-sm transition-colors duration-150",
                    active === id ? "bg-bg-muted font-medium text-orange-700" : "text-muted hover:text-text",
                  )}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="col-span-12 flex min-w-0 flex-col gap-12 2xl:col-span-10">
          <ThemePreview />
          <Foundations />
          <ChartDemo />
          <Buttons />
          <Flags />
          <Forms />
          <Cards />
          <TabsDemo />
          <Overlays />
          <Feedback />
          <DataDisplay />
          <TableDemo />
          <Media />
        </div>
      </div>
    </>
  );
}
