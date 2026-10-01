import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "../store/authStore";
import { ForbiddenPage } from "../features/errors/ForbiddenPage";

/**
 * Route guard. `allow(user)` decides access; anonymous users go to /login (Phase 2),
 * signed-in users without permission see a 403 page. The server enforces the same rules.
 */
export function ProtectedRoute({ allow, children }) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === "loading") return null;
  if (status === "anonymous") return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (allow && !allow(user)) return <ForbiddenPage />;
  return children;
}
