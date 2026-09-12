import { Prisma } from "@prisma/client";

// Putting the owner on a row being created.
//
// A create can be written two ways, and Prisma takes either but not a mixture: scalars
// (`seriesId: "…"`, `ownerId: "…"`) or relations (`series: { connect: … }`). A bare `ownerId`
// stamped onto a create that also writes a relation holding its own foreign key is the mixture,
// and Prisma refuses it — "Unknown argument `ownerId`". That was every new meeting filed under a
// series, from the release that brought accounts until the one that found it: nothing about it
// showed on an instance without accounts, which is where it had been tried.
//
// Which relations hold their key comes from Prisma's own description of the schema, so one added
// later is covered without anybody remembering this file.

const FK_RELATIONS: Record<string, Set<string>> = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name.charAt(0).toLowerCase() + m.name.slice(1),
    new Set(m.fields.filter((f) => (f.relationFromFields?.length ?? 0) > 0).map((f) => f.name)),
  ]),
);

/** The create's data with its owner on it, in whichever of the two shapes the rest of it uses. */
export function ownerStamp(
  model: string,
  data: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  const relational = Object.keys(data).some(
    (k) =>
      k !== "owner" &&
      FK_RELATIONS[model]?.has(k) === true &&
      data[k] !== null &&
      typeof data[k] === "object",
  );
  if (!relational) return { ...data, ownerId: userId };
  const rest = { ...data };
  delete rest.ownerId;
  return { ...rest, owner: { connect: { id: userId } } };
}
