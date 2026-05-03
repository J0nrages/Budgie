const FIRECRAWL_PARSE_URL = "https://api.firecrawl.dev/v2/parse";

type FirecrawlParseResponse = {
  success?: boolean;
  data?: {
    markdown?: string | null;
  };
};

export async function parsePdfWithFirecrawl(params: {
  data: ArrayBuffer;
  fileName: string;
  contentType: string;
  mode?: "fast" | "auto" | "ocr";
}): Promise<{ markdown: string }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("Firecrawl OCR fallback is not configured.");
  }

  const formData = new FormData();
  formData.set(
    "file",
    new Blob([params.data], {
      type: params.contentType || "application/pdf",
    }),
    params.fileName,
  );
  formData.set(
    "options",
    JSON.stringify({
      formats: ["markdown"],
      parsers: [{ type: "pdf", mode: params.mode ?? "ocr" }],
    }),
  );

  const response = await fetch(FIRECRAWL_PARSE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Firecrawl PDF parse failed (${response.status}): ${errorText || "Unknown error"}`,
    );
  }

  const payload = (await response.json()) as FirecrawlParseResponse;
  const markdown = payload.data?.markdown?.trim();
  if (!payload.success || !markdown) {
    throw new Error("Firecrawl returned no markdown for this PDF.");
  }

  return { markdown };
}
