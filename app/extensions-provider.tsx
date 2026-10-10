"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type ExtensionState, resolveExtensions } from "@/lib/extensions";

// Which extensions are on, for the client components (lib/extensions.ts). The root layout reads
// the state on the server and hands it down, so a page never draws something switched off and
// then removes it.

const Ctx = createContext<ExtensionState>(resolveExtensions(null));

export function ExtensionsProvider({ value, children }: { value: ExtensionState; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExtensions(): ExtensionState {
  return useContext(Ctx);
}

