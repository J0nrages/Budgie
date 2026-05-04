"use client";

import type { ChangeEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { Id } from "convex/_generated/dataModel";
import type { useImports } from "@/hooks/use-imports";
import { sha256Hex } from "@/lib/hash";

type ImportsApi = Pick<
  ReturnType<typeof useImports>,
  "uploadUrl" | "finalizeUpload"
>;

const UPLOAD_CONCURRENCY = 3;
/** Keep in sync with `MAX_BYTES` in `convex/statements.ts`. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type StatementUploadOutcome = {
  fileName: string;
  ok: boolean;
  kind?: "started" | "duplicate";
  message?: string;
};

function sniffPdfMagic(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, 4);
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) {
        resolve(false);
        return;
      }
      const bytes = new Uint8Array(buf);
      const isPdf =
        bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;
      resolve(isPdf);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsArrayBuffer(slice);
  });
}

async function validateFile(file: File): Promise<string | null> {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "File is empty.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File exceeds ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.`;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    try {
      const ok = await sniffPdfMagic(file);
      if (!ok) return "File does not look like a valid PDF.";
    } catch {
      return "Could not read file for validation.";
    }
  }
  return null;
}

export function useImportFileUpload(
  api: ImportsApi,
  getAccountId: () => Id<"accounts"> | undefined,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lastOutcomes, setLastOutcomes] = useState<StatementUploadOutcome[] | undefined>(
    undefined,
  );

  const onFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list?.length) return;
      const files = Array.from(list);
      setBusy(true);
      setLastOutcomes(undefined);
      const outcomes: StatementUploadOutcome[] = [];

      try {
        for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
          const batch = files.slice(i, i + UPLOAD_CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(async (file): Promise<StatementUploadOutcome> => {
              const validationError = await validateFile(file);
              if (validationError) {
                return { fileName: file.name, ok: false, message: validationError };
              }
              try {
                const sha256 = await sha256Hex(file);
                const { uploadUrl: url } = await api.uploadUrl({});
                const res = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": file.type || "application/octet-stream" },
                  body: file,
                });
                if (!res.ok) {
                  return {
                    fileName: file.name,
                    ok: false,
                    message: `Upload failed (${res.status})`,
                  };
                }
                const json = (await res.json()) as { storageId: Id<"_storage"> };
                const result = await api.finalizeUpload({
                  storageId: json.storageId,
                  fileName: file.name,
                  contentType: file.type || "application/octet-stream",
                  sizeBytes: file.size,
                  sha256,
                  accountId: getAccountId(),
                });
                if (result.kind === "duplicate") {
                  return {
                    fileName: file.name,
                    ok: true,
                    kind: "duplicate",
                    message: result.existingFileName,
                  };
                }
                return { fileName: file.name, ok: true, kind: "started" };
              } catch (err) {
                console.error(err);
                return {
                  fileName: file.name,
                  ok: false,
                  message: err instanceof Error ? err.message : "Upload failed",
                };
              }
            }),
          );
          outcomes.push(...batchResults);
        }

        setLastOutcomes(outcomes);
        const ok = outcomes.filter((o) => o.ok).length;
        const dup = outcomes.filter((o) => o.kind === "duplicate").length;
        const fail = outcomes.filter((o) => !o.ok).length;
        if (fail === 0 && dup === 0) {
          toast.success(
            files.length === 1
              ? "Statement uploaded — import workflow started."
              : `${ok} statements uploaded — import workflows started.`,
          );
        } else {
          toast.message("Upload batch finished", {
            description: `${ok} ok (${dup} duplicate), ${fail} failed — see console or re-upload failed files.`,
          });
        }
        e.target.value = "";
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Upload could not complete.");
      } finally {
        setBusy(false);
      }
    },
    [api, getAccountId],
  );

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return {
    inputRef,
    busy,
    onFile,
    openFileDialog,
    lastOutcomes,
  };
}
