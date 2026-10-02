import { useEffect, useState } from "react";
import { ChartNoAxesCombined, FilePlus2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { greetingFor, toIST } from "../../lib/format";
import { can } from "../../lib/permissions";

/** Re-render on the next minute boundary so the greeting flips exactly at 05:00, 12:00, 17:00 and 22:00 IST. */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(id);
  }, [now]);
  return now;
}

export function Greeting({ user }) {
  const now = useMinuteClock();
  const first = (user?.display_name || user?.username || "").split(" ")[0];
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl text-text">
          {greetingFor(now)}
          {first && `, ${first}`}
        </h1>
        <p className="mt-1 text-sm text-muted">{toIST(now).format("dddd, DD MMM YYYY")}</p>
      </div>
      <div className="flex items-center gap-3">
        {can.viewDashboard(user) && (
          <Button variant="secondary" icon={ChartNoAxesCombined} to="/dashboard">Open dashboard</Button>
        )}
        <Button icon={FilePlus2} to="/file-claim">File a new claim</Button>
      </div>
    </div>
  );
}
