// The administration screen's tabs. Apart from admin-screen.tsx, a client module: a constant
// imported from one into the server page arrives as a client reference, not the list.
export const ADMIN_TABS = ["people", "defaults", "machine", "extensions", "security"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
