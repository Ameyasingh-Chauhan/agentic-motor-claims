import { createBrowserRouter } from "react-router";
// react-router/dom wires ReactDOM.flushSync so navigations can opt out of transitions (instant filter updates).
import { RouterProvider } from "react-router/dom";
import { Providers } from "./providers";
import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { RouteError } from "../features/errors/RouteError";
import { pages } from "./pages";
import { can } from "../lib/permissions";
import { LoginPage } from "../features/auth/LoginPage";

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
      { path: "processing/:claimId", element: <P.theatre />, handle: { crumb: "Agent Theatre" } },
      { path: "whatsapp", element: <P.whatsapp />, handle: { crumb: "WhatsApp Journey" } },
      { path: "profile", element: <P.profile />, handle: { crumb: "Profile" } },
      { path: "settings", element: <P.settings />, handle: { crumb: "Settings" } },
      { path: "data-manager", element: guard(<P.dataManager />, can.manageData), handle: { crumb: "Data Manager" } },
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
