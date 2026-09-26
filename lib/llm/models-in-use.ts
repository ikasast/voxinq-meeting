import { asSystem } from "@/lib/db/scope";
import { prisma } from "@/lib/prisma";
import { readMachineSettings } from "@/lib/settings";

// The Ollama models somebody's minutes are written with.
//
// Server-only, and in its own file for that reason: `ollama-models.ts` is also read by the
// settings screen in the browser, and this reads the database.
//
// Deleting one of these would not fail at the moment of deleting — it would fail later, for
// someone else, as minutes that do not come. So the list is everything that decides a model:
// the machine's default, which everybody without their own choice uses, and each account's
// own choice. Across every account on purpose, since it is exactly the other people's choices
// that the administrator deleting it cannot see — and only the model names leave this function.
export async function modelsInUse(): Promise<string[]> {
  const machine = await readMachineSettings();
  const users = await asSystem("deleting a model has to know every account's choice of one", () =>
    prisma.user.findMany({ select: { settings: true } }),
  );
  const names = new Set<string>();
  if (machine.ollamaModel) names.add(machine.ollamaModel.trim());
  for (const u of users) {
    const s = (u.settings ?? {}) as Record<string, unknown>;
    if (typeof s.ollamaModel === "string" && s.ollamaModel.trim()) names.add(s.ollamaModel.trim());
  }
  return [...names];
}
