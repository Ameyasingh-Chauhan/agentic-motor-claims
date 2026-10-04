import { AnimatePresence, motion } from "motion/react";
import { Ambulance, HeartPulse, PhoneCall, ShieldCheck, Siren } from "lucide-react";
import { cn } from "../../lib/cn";
import { Field, Input } from "../../components/ui/Input";

/** Big yes/no choice buttons (radiogroup). */
export function Choice({ label, value, options, onChange, error, name }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-text">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const sel = value === o.value;
          const Icon = o.icon;
          return (
            <button key={String(o.value)} type="button" role="radio" aria-checked={sel} name={name} onClick={() => onChange(o.value)}
              className={cn("flex min-h-12 items-center gap-3 rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors duration-150",
                sel ? "border-primary bg-surface text-text ring-1 ring-primary" : "border-border bg-surface text-text hover:border-border-strong")}>
              {Icon && <Icon size={18} aria-hidden="true" className={sel ? "text-orange-700" : "text-muted"} />}{o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-caption text-danger">{error}</p>}
    </fieldset>
  );
}

const YES_NO = [{ value: true, label: "Yes" }, { value: false, label: "No" }];
const reveal = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

export function StepSafety({ form, update, errors }) {
  const tp = form.tp;
  return (
    <div className="flex flex-col gap-8">
      <Choice label="Is everyone safe?" value={form.safe} onChange={(v) => update({ safe: v })} error={errors.safe}
        options={[{ value: "yes", label: "Yes, everyone is safe", icon: ShieldCheck }, { value: "injured", label: "Someone is injured", icon: HeartPulse }]} />
      <AnimatePresence>
        {form.safe === "injured" && (
          <motion.div {...reveal} className="rounded-lg border border-danger bg-danger-bg p-4" role="alert">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger"><Siren size={18} aria-hidden="true" />Get help first — your claim can wait</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <a href="tel:112" className="flex items-center gap-3 rounded-md bg-surface px-4 py-3 text-text shadow-sm"><PhoneCall size={20} className="text-danger" aria-hidden="true" /><span><span className="num block text-xl font-semibold">112</span><span className="text-caption text-muted">National emergency</span></span></a>
              <a href="tel:108" className="flex items-center gap-3 rounded-md bg-surface px-4 py-3 text-text shadow-sm"><Ambulance size={20} className="text-danger" aria-hidden="true" /><span><span className="num block text-xl font-semibold">108</span><span className="text-caption text-muted">Ambulance</span></span></a>
            </div>
            <p className="mt-3 text-caption text-text">We'll add the medical documents and police report to your checklist.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <Choice label="Was a third party involved (another vehicle, person or property)?" value={form.third_party} onChange={(v) => update({ third_party: v })} options={YES_NO} error={errors.third_party} />
      <AnimatePresence>
        {form.third_party && (
          <motion.div {...reveal} className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 md:grid-cols-3">
            <Field label="Their name (optional)">{(p) => <Input {...p} value={tp.name} onChange={(e) => update({ tp: { ...tp, name: e.target.value } })} />}</Field>
            <Field label="Their vehicle number (optional)">{(p) => <Input {...p} value={tp.vehicle} onChange={(e) => update({ tp: { ...tp, vehicle: e.target.value.toUpperCase() } })} placeholder="MH 12 XY 0000" />}</Field>
            <Field label="Their phone (optional)">{(p) => <Input {...p} inputMode="tel" value={tp.phone} onChange={(e) => update({ tp: { ...tp, phone: e.target.value } })} />}</Field>
          </motion.div>
        )}
      </AnimatePresence>
      <Choice label="Were the police informed?" value={form.police} onChange={(v) => update({ police: v })} options={YES_NO} error={errors.police} />
      <AnimatePresence>
        {form.police && (
          <motion.div {...reveal} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="FIR number (optional)" hint="If an FIR was registered">{(p) => <Input {...p} value={form.fir_number} onChange={(e) => update({ fir_number: e.target.value })} placeholder="PUN/1129/2026" />}</Field>
            <Field label="Police station (optional)">{(p) => <Input {...p} value={form.fir_station} onChange={(e) => update({ fir_station: e.target.value })} />}</Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
