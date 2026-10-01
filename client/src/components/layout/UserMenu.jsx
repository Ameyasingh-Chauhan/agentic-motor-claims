import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CircleUser, Settings, Keyboard, LogOut, Palette } from "lucide-react";
import { DropdownMenu } from "../ui/Popover";
import { useAuthStore } from "../../store/authStore";
import { useShortcutsStore } from "./shortcutsStore";
import { can } from "../../lib/permissions";

/** User menu: Profile, Settings, Keyboard shortcuts, (Style guide for developers), Sign out. */
export function UserMenu({ trigger, placement = "bottom-end" }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const openShortcuts = useShortcutsStore((s) => s.setOpen);

  const items = [
    { type: "label", label: user?.email ?? user?.title ?? "" },
    { label: "Profile", icon: CircleUser, onSelect: () => navigate("/profile") },
    { label: "Settings", icon: Settings, onSelect: () => navigate("/settings") },
    { label: "Keyboard shortcuts", icon: Keyboard, shortcut: "?", onSelect: () => openShortcuts(true) },
    ...(can.viewStyleguide(user) ? [{ label: "Style guide", icon: Palette, onSelect: () => navigate("/styleguide") }] : []),
    { type: "separator" },
    {
      label: "Sign out",
      icon: LogOut,
      danger: true,
      // Phase 2 wires this to POST /api/auth/logout.
      onSelect: () => toast.info("Sign-in and sign-out arrive with authentication in Phase 2."),
    },
  ];
  return <DropdownMenu trigger={trigger} items={items} placement={placement} className="w-60" />;
}
