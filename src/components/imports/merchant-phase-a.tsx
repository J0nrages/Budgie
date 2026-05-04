"use client";

import type { Doc, Id } from "convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { MerchantLogo } from "@/components/merchants/merchant-logo";
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
    | "merchants"
    | "createMerchant"
    | "upsertMerchantAlias"
    | "setMerchantLogoDomain"
  >;
};

export function MerchantPhaseATools({ importsApi }: Props) {
  const { merchants, createMerchant, upsertMerchantAlias, setMerchantLogoDomain } = importsApi;
  const [name, setName] = useState("");
  const [aliasMerchantId, setAliasMerchantId] = useState<Id<"merchants"> | "">("");
  const [aliasPattern, setAliasPattern] = useState("");
  const [logoDomainDraft, setLogoDomainDraft] = useState("");

  const selectedMerchant: Doc<"merchants"> | undefined = aliasMerchantId
    ? merchants?.find((x) => x._id === aliasMerchantId)
    : undefined;

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
            onValueChange={(v) => {
              const id = v === "__none__" ? "" : (v as Id<"merchants">);
              setAliasMerchantId(id);
              if (!id) {
                setLogoDomainDraft("");
                return;
              }
              const m = merchants?.find((x) => x._id === id);
              setLogoDomainDraft(m?.logoDomain ?? "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select merchant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select…</SelectItem>
              {(merchants ?? []).map((m) => (
                <SelectItem key={m._id} value={m._id}>
                  <span className="flex items-center gap-2">
                    <MerchantLogo merchant={m} size={22} logoSize={64} />
                    <span>{m.canonicalName}</span>
                  </span>
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

      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">Logo.dev (optional)</p>
        <p className="text-xs text-muted-foreground">
          Set a verified hostname for accurate logos (
          <code className="rounded bg-muted px-1">wholefoodsmarket.com</code>
          ). Otherwise the canonical name uses name lookup. Add{" "}
          <code className="rounded bg-muted px-1">NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY</code> in{" "}
          <code className="rounded bg-muted px-1">.env.local</code>.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {selectedMerchant ? (
            <MerchantLogo merchant={selectedMerchant} size={40} logoSize={128} />
          ) : (
            <div
              className="flex shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
              style={{ width: 40, height: 40 }}
            >
              —
            </div>
          )}
          <div className="grid min-w-[220px] flex-1 gap-1.5">
            <Label htmlFor="logo-domain">Logo domain</Label>
            <Input
              id="logo-domain"
              disabled={!aliasMerchantId}
              value={logoDomainDraft}
              onChange={(e) => setLogoDomainDraft(e.target.value)}
              placeholder="e.g. wholefoodsmarket.com"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!aliasMerchantId}
            onClick={async () => {
              if (!aliasMerchantId) return;
              try {
                const saved = await setMerchantLogoDomain({
                  merchantId: aliasMerchantId,
                  logoDomain: logoDomainDraft.trim() || null,
                });
                setLogoDomainDraft(saved ?? "");
                toast.success(saved ? "Logo domain saved." : "Logo domain cleared.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Save failed");
              }
            }}
          >
            Save domain
          </Button>
        </div>
      </div>
    </div>
  );
}
