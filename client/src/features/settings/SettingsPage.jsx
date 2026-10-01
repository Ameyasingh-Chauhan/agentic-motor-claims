import { Monitor, Moon, Sun } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Checkbox";
import { Field } from "../../components/ui/Input";
import { useUiStore } from "../../store/uiStore";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
];

/** Settings: appearance preferences (stored locally now; synced to users.json via PATCH /users/me in Phase 2+). */
export default function SettingsPage() {
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  return (
    <>
      <PageHeader title="Settings" description="Personalise how the console looks and behaves." />
      <div className="grid max-w-3xl gap-6">
        <Card title="Appearance" subtitle="Theme, table density and navigation.">
          <div className="flex flex-col gap-4">
            <Field label="Theme" hint="“Match system” follows your operating system's light/dark setting.">
              {(p) => <Select {...p} options={THEME_OPTIONS} value={themePreference} onChange={(v) => setThemePreference(v)} className="max-w-xs" />}
            </Field>
            <Switch
              label="Compact tables"
              description="40px rows instead of 52px — fits more claims on screen."
              checked={density === "compact"}
              onChange={(v) => setDensity(v ? "compact" : "comfortable")}
            />
            <Switch
              label="Collapse sidebar"
              description="Icons only. Toggle any time with Ctrl+B."
              checked={collapsed}
              onChange={setCollapsed}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
