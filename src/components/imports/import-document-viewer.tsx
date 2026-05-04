"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  fileUrl: string | null | undefined;
  fileName: string;
  contentType?: string;
  sourceHint?: string;
};

function looksLikeCsv(fileName: string, contentType: string | undefined) {
  return fileName.toLowerCase().endsWith(".csv") || contentType?.includes("csv");
}

function CsvPreview({ text, sourceHint }: { text: string; sourceHint?: string }) {
  const rows = useMemo(() => text.split(/\r?\n/).filter((line) => line.length > 0), [text]);
  const previewRows = rows.slice(0, 120);
  const normalizedHint = sourceHint?.trim().toLowerCase();

  return (
    <div className="h-[72vh] overflow-auto bg-background">
      <div className="border-b px-4 py-3 text-xs text-muted-foreground">
        Showing the first {previewRows.length} non-empty lines from the original CSV.
      </div>
      <div className="divide-y font-mono text-xs">
        {previewRows.map((line, index) => {
          const isHintMatch =
            normalizedHint && normalizedHint.length > 0
              ? line.toLowerCase().includes(normalizedHint)
              : false;

          return (
            <div
              key={`${index}:${line}`}
              className={isHintMatch ? "bg-primary/10 px-4 py-2" : "px-4 py-2"}
            >
              <span className="mr-3 text-muted-foreground">{index + 1}</span>
              <span className="break-all">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ImportDocumentViewer({ fileUrl, fileName, contentType, sourceHint }: Props) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const isCsv = looksLikeCsv(fileName, contentType);

  useEffect(() => {
    let cancelled = false;
    if (!fileUrl || !isCsv) {
      setCsvText(null);
      setCsvError(null);
      return;
    }

    void fetch(fileUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load CSV preview (${response.status})`);
        return await response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setCsvText(text);
          setCsvError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCsvText(null);
          setCsvError(error instanceof Error ? error.message : "Could not load CSV preview");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileUrl, isCsv]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="font-medium">Original document</p>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open raw file
          </a>
        ) : null}
      </div>
      {fileUrl ? (
        isCsv ? (
          csvText ? (
            <CsvPreview text={csvText} sourceHint={sourceHint} />
          ) : csvError ? (
            <div className="flex h-[72vh] items-center justify-center p-6 text-sm text-destructive">
              {csvError}
            </div>
          ) : (
            <div className="flex h-[72vh] items-center justify-center p-6 text-sm text-muted-foreground">
              Loading original CSV preview…
            </div>
          )
        ) : (
          <div className="h-[72vh] bg-black/5">
            <iframe
              title={`Statement preview: ${fileName}`}
              src={fileUrl}
              className="h-full w-full"
            />
          </div>
        )
      ) : (
        <div className="flex h-[72vh] items-center justify-center p-6 text-sm text-muted-foreground">
          Original file is no longer retained in storage.
        </div>
      )}
    </div>
  );
}
