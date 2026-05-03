"use client";

import type { Id } from "convex/_generated/dataModel";
import { useRef, useState } from "react";
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
import { sha256Hex } from "@/lib/hash";

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
  const { uploadUrl, finalizeUpload } = importsApi;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [accountKey, setAccountKey] = useState<string>("__none__");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const sha256 = await sha256Hex(file);
      const { uploadUrl: url } = await uploadUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const json = (await res.json()) as { storageId: Id<"_storage"> };
      const result = await finalizeUpload({
        storageId: json.storageId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        sha256,
        accountId:
          accountKey !== "__none__"
            ? (accountKey as Id<"accounts">)
            : undefined,
      });
      if (result.kind === "duplicate") {
        toast.error(
          `Duplicate statement skipped. Matching file: ${result.existingFileName}`,
        );
      } else {
        toast.success("Statement uploaded — import workflow started.");
      }
      e.target.value = "";
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Upload could not complete.",
      );
    } finally {
      setBusy(false);
    }
  }

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
        <Input
          id="stmt-file"
          ref={inputRef}
          type="file"
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
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : "Browse…"}
      </Button>
    </div>
  );
}
