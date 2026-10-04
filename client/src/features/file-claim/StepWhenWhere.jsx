import { useState } from "react";
import { motion } from "motion/react";
import { Clock, LocateFixed, MapPin, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Field, Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { AiMark, useCities } from "./StepIncident";
import { daysAgo, istNow } from "./rules";

// Schematic outline of India (lng, lat), enough to place a city pin — not a survey map.
const OUTLINE = [[68.2, 23.7], [69.5, 22.4], [70.3, 20.9], [72.6, 21.1], [72.8, 19.0], [73.4, 16.0], [74.3, 14.0], [74.9, 12.7], [75.8, 11.0],
  [76.3, 9.5], [77.2, 8.1], [77.6, 8.2], [78.2, 9.0], [79.3, 10.3], [79.8, 11.6], [80.2, 13.1], [80.1, 15.2], [81.3, 16.4], [82.3, 17.0],
  [84.2, 18.6], [85.9, 19.8], [86.9, 21.2], [87.9, 21.7], [88.9, 21.6], [89.0, 22.5], [88.7, 24.2], [88.1, 24.6], [88.5, 26.2], [89.8, 26.0],
  [92.1, 25.1], [92.6, 23.7], [93.3, 23.9], [93.9, 25.4], [95.2, 26.6], [97.3, 28.2], [95.4, 29.2], [94.0, 28.3], [92.0, 27.8], [89.6, 26.8],
  [88.9, 27.3], [88.1, 27.9], [86.0, 27.4], [84.0, 27.5], [83.3, 27.4], [81.0, 28.6], [80.1, 30.0], [79.0, 31.0], [78.3, 32.6], [78.9, 34.3],
  [77.8, 35.5], [75.0, 36.9], [73.8, 34.5], [74.5, 32.8], [75.4, 32.2], [74.6, 31.1], [73.9, 30.4], [72.3, 28.0], [70.4, 27.6], [69.5, 26.7],
  [70.6, 25.7], [71.1, 24.4], [68.8, 24.3]];
const W = 300, H = 330;
const proj = (lng, lat) => [((lng - 67.5) / (98 - 67.5)) * W, ((37.5 - lat) / (37.5 - 6.5)) * H];
const PATH = `M${OUTLINE.map(([a, b]) => proj(a, b).map((n) => n.toFixed(1)).join(",")).join("L")}Z`;

function IndiaMap({ cities, city, lat, lng }) {
  const sel = cities.find((c) => c.city === city);
  const pin = lat != null && lng != null ? proj(lng, lat) : sel ? proj(sel.lng, sel.lat) : null;
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-64" role="img" aria-label={city ? `Map of India with a pin at ${city}` : "Map of India"}>
        <path d={PATH} className="fill-bg-subtle stroke-border-strong" strokeWidth="1.5" strokeLinejoin="round" />
        {cities.map((c) => { const [x, y] = proj(c.lng, c.lat); return <circle key={c.city} cx={x} cy={y} r="1.8" className="fill-subtle" />; })}
        {pin && (
          <motion.g key={`${pin[0]}-${pin[1]}`} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
            <circle cx={pin[0]} cy={pin[1]} r="7" className="wz-ping fill-primary" opacity="0.5" />
            <circle cx={pin[0]} cy={pin[1]} r="5" className="fill-primary stroke-surface" strokeWidth="2" />
          </motion.g>
        )}
      </svg>
      <figcaption className="text-caption text-muted">{city ? `${city}${sel ? `, ${sel.state}` : ""}` : "Choose a city to place the pin"}</figcaption>
    </figure>
  );
}

/** The AI-filled marker sits beside the field label (outside the <label>, so its Confirm button stays a separate control). */
function AiSlot({ state, onConfirm, children }) {
  return <div className="relative">{children}<span className="absolute top-0 right-0">{<AiMark state={state} onConfirm={onConfirm} />}</span></div>;
}

function haversine(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function StepWhenWhere({ form, update, errors, admin }) {
  const cities = useCities();
  const [locating, setLocating] = useState(false);
  const now = istNow();
  const edit = (k, v, extra = {}) => update((f) => ({ [k]: v, ...extra, ai_filled: { ...f.ai_filled, [k]: undefined } }));
  const confirm = (k) => update((f) => ({ ai_filled: { ...f.ai_filled, [k]: "confirmed" } }));
  const late = daysAgo(form);

  const locate = () => {
    if (!navigator.geolocation) { toast.error("Location isn't available in this browser"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocating(false);
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const near = [...(cities.data ?? [])].sort((a, b) => haversine(here, a) - haversine(here, b))[0];
      if (!near) return;
      const km = Math.round(haversine(here, near));
      update((f) => ({ city: near.city, lat: here.lat, lng: here.lng, ai_filled: { ...f.ai_filled, city: undefined } }));
      toast.success(`Nearest city: ${near.city} (${km} km away)`);
    }, (err) => { setLocating(false); toast.error(err.code === 1 ? "Location permission was denied" : "Couldn't get your location"); }, { timeout: 10_000, maximumAge: 60_000 });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AiSlot state={form.ai_filled.date} onConfirm={() => confirm("date")}><Field label="Date" error={errors.date} required>
            {(p) => <Input {...p} type="date" max={now.date} value={form.date} onChange={(e) => edit("date", e.target.value)} />}
          </Field></AiSlot>
          <AiSlot state={form.ai_filled.time} onConfirm={() => confirm("time")}><Field label="Time (IST)" required>
            {(p) => <Input {...p} type="time" icon={Clock} value={form.time} onChange={(e) => edit("time", e.target.value)} />}
          </Field></AiSlot>
        </div>
        {admin && late != null && late > 7 && (
          <div className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning" role="note">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Late intimation: reported {Math.floor(late)} days after the incident (handler note — not shown to the customer).
          </div>
        )}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <AiSlot state={form.ai_filled.city} onConfirm={() => confirm("city")}><Field label="City" error={errors.city} required>
                {(p) => cities.isPending ? <Skeleton className="h-10 w-full" /> : (
                  <Select {...p} value={form.city || null} placeholder="Choose a city"
                    options={(cities.data ?? []).map((c) => ({ value: c.city, label: c.city, description: c.state }))}
                    onChange={(v) => { const c = cities.data.find((x) => x.city === v); edit("city", v, { lat: c?.lat ?? null, lng: c?.lng ?? null }); }} />
                )}
              </Field></AiSlot>
            </div>
            <Button variant="secondary" icon={LocateFixed} loading={locating} onClick={locate}>Use my current location</Button>
          </div>
          <AiSlot state={form.ai_filled.location_text} onConfirm={() => confirm("location_text")}><Field label="Area or landmark" error={errors.location_text} required>
            {(p) => <Input {...p} icon={MapPin} value={form.location_text} onChange={(e) => edit("location_text", e.target.value)} placeholder="Near Khed Shivapur toll plaza" maxLength={140} />}
          </Field></AiSlot>
          <Field label="Highway or road (optional)">
            {(p) => <Input {...p} value={form.road} onChange={(e) => edit("road", e.target.value)} placeholder="NH48" maxLength={50} />}
          </Field>
        </div>
      </div>
      <div className="lg:w-64">{cities.data ? <IndiaMap cities={cities.data} city={form.city} lat={form.lat} lng={form.lng} /> : <Skeleton className="h-72 w-64" rounded="lg" />}</div>
    </div>
  );
}
