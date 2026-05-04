"use client";

import type { Id } from "convex/_generated/dataModel";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImportFileUpload } from "@/hooks/use-import-file-upload";
import type { useImports } from "@/hooks/use-imports";

type Props = {
  importsApi: ReturnType<typeof useImports>;
  accounts:
    | {
        _id: Id<"accounts">;
        name: string;
      }[]
    | undefined;
};

export function StatementUpload({ importsApi, accounts }: Props) {
  const [accountKey, setAccountKey] = useState<string>("__none__");
  const getAccountId = useCallback((): Id<"accounts"> | undefined => {
    return accountKey !== "__none__" ? (accountKey as Id<"accounts">) : undefined;
  }, [accountKey]);
  const { inputRef, busy, onFile, openFileDialog } = useImportFileUpload(
    importsApi,
    getAccountId,
  );

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="stmt-acct">Link to account (recommended)</Label>
        <Select value={accountKey} onValueChange={setAccountKey}>
          <SelectTrigger id="stmt-acct" className="w-[220px]">
            <SelectValue placeholder="Optional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {(accounts ?? []).map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="stmt-file">Statement file</Label>
        <input
          id="stmt-file"
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.pdf,text/csv,application/pdf"
          disabled={busy}
          onChange={onFile}
          className="hidden"
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={openFileDialog}
      >
        {busy ? "Uploading…" : "Browse…"}
      </Button>
    </div>
  );
}
