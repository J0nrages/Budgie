"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useImports } from "@/hooks/use-imports";
import { formatUsd } from "@/lib/money";
import type { AccountSubtype, AccountType } from "@/types/finance";
import { statusBadgeClass } from "@/styles/design-tokens";

type Props = {
  job: Doc<"importJobs">;
  accounts: Doc<"accounts">[] | undefined;
  importsApi: ReturnType<typeof useImports>;
};

const accountTypeOptions: AccountType[] = ["asset", "liability"];
const accountSubtypeOptions: AccountSubtype[] = [
  "checking",
  "savings",
  "creditCard",
  "loan",
  "cash",
  "other",
];

function suggestedDefaults(
  suggestion: Doc<"importJobs">["accountSuggestion"] | null | undefined,
): {
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
} {
  if (suggestion?.issuer === "Discover") {
    return {
      name: `${suggestion.issuer} ${suggestion.lastFour}`,
      type: "liability",
      subtype: "creditCard",
    };
  }

  return {
    name: suggestion ? `${suggestion.issuer} ${suggestion.lastFour}` : "",
    type: "asset",
    subtype: "checking",
  };
}

export function AccountLinkPrompt({ job, accounts, importsApi }: Props) {
  const { accountSuggestion, linkImportJobToAccount } = importsApi;
  const suggestion = accountSuggestion ?? job.accountSuggestion ?? null;

  const exactMatch = useMemo(
    () =>
      suggestion
        ? (accounts ?? []).find(
            (account) =>
              account.issuer === suggestion.issuer &&
              account.lastFour === suggestion.lastFour,
          )
        : undefined,
    [accounts, suggestion],
  );

  const defaults = suggestedDefaults(suggestion);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    undefined,
  );
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<AccountType | undefined>(undefined);
  const [draftSubtype, setDraftSubtype] = useState<AccountSubtype | undefined>(
    undefined,
  );
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);

  if (job.status !== "needsAccountLink") return null;

  const resolvedSelectedAccountId =
    selectedAccountId ?? exactMatch?._id ?? "__none__";
  const resolvedDraftName = draftName || defaults.name;
  const resolvedDraftType = draftType ?? defaults.type;
  const resolvedDraftSubtype = draftSubtype ?? defaults.subtype;

  async function onLinkExisting() {
    if (resolvedSelectedAccountId === "__none__") {
      toast.error("Select an existing account first.");
      return;
    }

    setLinking(true);
    try {
      await linkImportJobToAccount({
        importJobId: job._id,
        accountId: resolvedSelectedAccountId as Id<"accounts">,
      });
      toast.success("Import job linked to account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link failed");
    } finally {
      setLinking(false);
    }
  }

  async function onCreateAccount() {
    const name = resolvedDraftName.trim();
    if (!name) {
      toast.error("Account name is required.");
      return;
    }

    setCreating(true);
    try {
      await linkImportJobToAccount({
        importJobId: job._id,
        accountDraft: {
          name,
          type: resolvedDraftType,
          subtype: resolvedDraftSubtype,
          initialBalanceCents: 0,
        },
      });
      toast.success("Account created and linked to import job.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account creation failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="border-violet-500/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Confirm Account Match</CardTitle>
          <Badge className={statusBadgeClass.needsAccountLink}>
            needsAccountLink
          </Badge>
        </div>
        <CardDescription>
          This statement parsed successfully, but it is waiting for you to link or
          create an account before review can continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {suggestion ? (
          <div className="grid gap-2 rounded-lg border border-border/60 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Issuer</p>
              <p>{suggestion.issuer}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last four</p>
              <p>{suggestion.lastFour}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Statement period</p>
              <p>
                {suggestion.statementPeriodStart ?? "?"} to{" "}
                {suggestion.statementPeriodEnd ?? "?"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Credit limit</p>
              <p>
                {suggestion.creditLimitCents !== undefined
                  ? formatUsd(suggestion.creditLimitCents)
                  : "Unknown"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <div>
              <p className="font-medium">Link to existing account</p>
              <p className="text-sm text-muted-foreground">
                Existing matches are preselected when issuer and last four line up.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="existing-account">Existing account</Label>
              <Select
                value={resolvedSelectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger id="existing-account" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None selected</SelectItem>
                  {(accounts ?? []).map((account) => {
                    const isMatch =
                      suggestion &&
                      account.issuer === suggestion.issuer &&
                      account.lastFour === suggestion.lastFour;
                    return (
                      <SelectItem key={account._id} value={account._id}>
                        {account.name}
                        {isMatch ? " (match)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={onLinkExisting}
              disabled={linking}
            >
              {linking ? "Linking…" : "Link selected account"}
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <div>
              <p className="font-medium">Create new account</p>
              <p className="text-sm text-muted-foreground">
                Suggested values come from the parsed statement and can be adjusted.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-account-name">Account name</Label>
              <Input
                id="new-account-name"
                value={resolvedDraftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Discover 1234"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-account-type">Type</Label>
                <Select
                  value={resolvedDraftType}
                  onValueChange={(value) => setDraftType(value as AccountType)}
                >
                  <SelectTrigger id="new-account-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-account-subtype">Subtype</Label>
                <Select
                  value={resolvedDraftSubtype}
                  onValueChange={(value) =>
                    setDraftSubtype(value as AccountSubtype)
                  }
                >
                  <SelectTrigger id="new-account-subtype" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountSubtypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" onClick={onCreateAccount} disabled={creating}>
              {creating ? "Creating…" : "Create new account from statement"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
