// UI-side permission checks (§9.4). The server enforces the same rules; this only hides UI.

export const isAdmin = (user) => user?.role === "admin";
export const isCustomer = (user) => user?.role === "customer";
export const isDeveloper = (user) => Boolean(user?.is_developer);

export const can = {
  viewDashboard: isAdmin,
  takeClaimActions: isAdmin,
  viewHandlerDetail: isAdmin,
  viewDevTools: isDeveloper,
  manageData: (user) => isAdmin(user) || isDeveloper(user),
  viewStyleguide: isDeveloper,
};

export function roleLabel(user) {
  if (!user) return "";
  if (isDeveloper(user)) return "Admin · Developer";
  if (isAdmin(user)) return "Admin";
  return "Customer";
}
