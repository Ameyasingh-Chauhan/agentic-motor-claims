import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { useUiStore } from "../../store/uiStore";

/** Dark-mode toggle: sun/moon icon morph; the new theme reveals in a circle from the button. */
export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={dark}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
        className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md text-muted transition-colors duration-150 hover:bg-bg-muted hover:text-text"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={dark ? "moon" : "sun"}
            className="absolute inline-flex"
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.2 }}
          >
            {dark ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}
