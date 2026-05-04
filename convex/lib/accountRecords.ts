import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function assertUniqueAccountName(
  ctx: MutationCtx,
  type: Doc<"accounts">["type"],
  name: string,
  exceptAccountId?: Id<"accounts">,
): Promise<void> {
  const clash = await ctx.db
    .query("accounts")
    .withIndex("by_type_name", (q) => q.eq("type", type).eq("name", name))
    .unique()
    .catch(() => null);
  if (clash && clash._id !== exceptAccountId) {
    throw new Error(
      exceptAccountId
        ? "Another account already uses this name for this type"
        : "An account with this type and name already exists",
    );
  }
}

export async function createAccountRecord(
  ctx: MutationCtx,
  args: {
    name: string;
    type: Doc<"accounts">["type"];
    subtype: Doc<"accounts">["subtype"];
    issuer?: string;
    institution?: string;
    lastFour?: string;
    initialBalanceCents: number;
    creditLimitCents?: number;
    aprBps?: number;
    statementDay?: number;
    paymentDueDay?: number;
    lenderProfile?: {
      aprBps?: number;
      gracePeriodDays?: number;
      statementDay?: number;
      paymentDueDay?: number;
      interestMethod: Doc<"lenderProfiles">["interestMethod"];
    };
  },
): Promise<Id<"accounts">> {
  const now = Date.now();
  const name = args.name.trim();
  if (name.length === 0) throw new Error("Account name is required");

  await assertUniqueAccountName(ctx, args.type, name);

  const accountId = await ctx.db.insert("accounts", {
    name,
    type: args.type,
    subtype: args.subtype,
    issuer: normalizeOptionalString(args.issuer),
    institution: normalizeOptionalString(args.institution),
    lastFour: normalizeOptionalString(args.lastFour),
    initialBalanceCents: args.initialBalanceCents,
    creditLimitCents: args.creditLimitCents,
    aprBps: args.aprBps,
    statementDay: args.statementDay,
    paymentDueDay: args.paymentDueDay,
    createdAt: now,
    updatedAt: now,
  });

  if (args.lenderProfile) {
    await ctx.db.insert("lenderProfiles", {
      accountId,
      aprBps: args.lenderProfile.aprBps,
      gracePeriodDays: args.lenderProfile.gracePeriodDays,
      statementDay: args.lenderProfile.statementDay,
      paymentDueDay: args.lenderProfile.paymentDueDay,
      interestMethod: args.lenderProfile.interestMethod,
      createdAt: now,
      updatedAt: now,
    });
  }

  return accountId;
}
