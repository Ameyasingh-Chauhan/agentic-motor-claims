import { Modal } from "../ui/Modal";
import { Kbd } from "../ui/Kbd";
import { useHotkey } from "../../hooks/useHotkeys";
import { useShortcutsStore } from "./shortcutsStore";

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], label: "Open command palette / search" },
  { keys: ["Ctrl", "B"], label: "Collapse or expand the sidebar" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
  { keys: ["Esc"], label: "Close dialogs, menus and the image viewer" },
  { keys: ["←", "→"], label: "Previous / next image in the viewer; switch tabs" },
  { keys: ["↑", "↓"], label: "Move between table rows and menu items" },
  { keys: ["Enter"], label: "Open the focused row or item" },
];

/** Keyboard shortcuts modal, opened with `?` or from the user menu. */
export function ShortcutsModal() {
  const open = useShortcutsStore((s) => s.open);
  const setOpen = useShortcutsStore((s) => s.setOpen);
  useHotkey("?", () => setOpen(true));
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="sm">
      <ul className="flex flex-col divide-y divide-border">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 py-3 text-sm text-text">
            {s.label}
            <Kbd keys={s.keys} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
