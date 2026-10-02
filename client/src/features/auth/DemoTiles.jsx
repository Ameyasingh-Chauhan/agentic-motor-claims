import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CodeXml, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "../../components/ui/Avatar";
import { Skeleton } from "../../components/ui/Skeleton";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";

function roleOf(a) {
  if (a.role === "customer") return { label: "Customer", icon: UserRound };
  return a.is_developer ? { label: "Admin · Developer", icon: CodeXml } : { label: "Admin", icon: ShieldCheck };
}

/**
 * Quick demo login (§9.3, DEMO_MODE only). A tile only fills the form — the user still presses Sign in.
 * Renders nothing when the server has demo mode off (404) or the request fails.
 */
export function DemoTiles({ onPick, disabled, activeUsername }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["auth", "demo-accounts"],
    queryFn: () => api("/auth/demo-accounts"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (isError || (!isPending && !data?.accounts?.length)) return null;

  return (
    <section className="login-demo mt-6" aria-labelledby="demo-heading">
      <div className="flex items-center gap-3">
        <h3 id="demo-heading" className="text-caption text-muted">Quick demo login</h3>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {isPending
          ? [0, 1, 2].map((i) => <li key={i}><Skeleton className="login-tile h-13 w-full rounded-md" /></li>)
          : data.accounts.map((a) => {
              const role = roleOf(a);
              const active = activeUsername === a.username;
              return (
                <li key={a.username}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(a)}
                    aria-label={`Fill in ${a.display_name}, ${role.label}`}
                    className={cn(
                      "login-tile group flex h-13 w-full items-center gap-3 rounded-md border px-3 text-left transition-[background-color,border-color] duration-150",
                      "hover:border-border-strong hover:bg-bg-muted disabled:cursor-wait disabled:opacity-70",
                      active ? "border-orange-600 bg-bg-muted" : "border-border bg-surface",
                    )}
                  >
                    <Avatar name={a.display_name} src={a.avatar} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-text">{a.display_name}</span>
                      <span className="inline-flex items-center gap-1 text-caption text-muted">
                        <role.icon size={12} aria-hidden="true" />
                        {role.label}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true"
                      className="shrink-0 text-subtle opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
