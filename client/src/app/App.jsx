import { createBrowserRouter, RouterProvider } from "react-router";
import { Providers } from "./providers";
import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { RouteError } from "../features/errors/RouteError";
import { pages } from "./pages";
import { can } from "../lib/permissions";
import { LoginPage } from "../features/auth/LoginPageV2";

const P = pages;
const guard = (el, allow) => <ProtectedRoute allow={allow}>{el}</ProtectedRoute>;

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: guard(<AppShell />),
    errorElement: <RouteError />,
    handle: { crumb: "Home" },
    children: [
      { index: true, element: <P.home /> },
      { path: "claims/:claimId", element: <P.claimDetail />, handle: { crumb: "Claim detail" } },
      { path: "dashboard", element: guard(<P.dashboard />, can.viewDashboard), handle: { crumb: "Dashboard" } },
      { path: "file-claim", element: <P.fileClaim />, handle: { crumb: "File a Claim" } },
      { path: "whatsapp", element: <P.whatsapp />, handle: { crumb: "WhatsApp Journey" } },
      { path: "support", element: <P.support />, handle: { crumb: "Support" } },
      { path: "profile", element: <P.profile />, handle: { crumb: "Profile" } },
      { path: "settings", element: <P.settings />, handle: { crumb: "Settings" } },
      { path: "dev", element: guard(<P.dev />, can.viewDevTools), handle: { crumb: "Dev Tools" } },
      { path: "styleguide", element: guard(<P.styleguide />, can.viewStyleguide), handle: { crumb: "Style guide" } },
      { path: "*", element: <P.notFound />, handle: { crumb: "Not found" } },
    ],
  },
]);

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
