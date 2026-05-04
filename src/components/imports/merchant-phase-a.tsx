"use client";

import type { Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

type Props = {
  importsApi: Pick<
    ReturnType<typeof useImports>,
    "merchants" | "createMerchant" | "upsertMerchantAlias"
  >;
};

export function MerchantPhaseATools({ importsApi }: Props) {
  const { merchants, createMerchant, upsertMerchantAlias } = importsApi;
  const [name, setName] = useState("");
  const [aliasMerchantId, setAliasMerchantId] = useState<Id<"merchants"> | "">("");
  const [aliasPattern, setAliasPattern] = useState("");

  return (
    <div className="space-y-4 rounded-md border p-4">
      <p className="text-sm font-medium">Merchants (Phase A)</p>
      <p className="text-xs text-muted-foreground">
        Create a canonical merchant, then add alias patterns so imports resolve to the same{" "}
        <code className="rounded bg-muted px-1">merchantId</code> on accept.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-[200px] gap-1.5">
          <Label htmlFor="new-merchant">Canonical name</Label>
          <Input
            id="new-merchant"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Whole Foods"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            try {
              await createMerchant({ canonicalName: name });
              toast.success("Merchant created.");
              setName("");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Create failed");
            }
          }}
        >
          Create
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-[200px] gap-1.5">
          <Label>Merchant</Label>
          <Select
            value={aliasMerchantId || "__none__"}
            onValueChange={(v) =>
              setAliasMerchantId(v === "__none__" ? "" : (v as Id<"merchants">))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select merchant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select…</SelectItem>
              {(merchants ?? []).map((m) => (
                <SelectItem key={m._id} value={m._id}>
                  {m.canonicalName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-[200px] gap-1.5">
          <Label htmlFor="alias-pattern">Alias pattern</Label>
          <Input
            id="alias-pattern"
            value={aliasPattern}
            onChange={(e) => setAliasPattern(e.target.value)}
            placeholder="Normalized text to match"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!aliasMerchantId}
          onClick={async () => {
            if (!aliasMerchantId) return;
            try {
              await upsertMerchantAlias({
                merchantId: aliasMerchantId,
                aliasPattern,
              });
              toast.success("Alias saved.");
              setAliasPattern("");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Alias failed");
            }
          }}
        >
          Save alias
        </Button>
      </div>
    </div>
  );
}
