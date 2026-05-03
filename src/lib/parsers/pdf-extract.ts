import { extractText, getDocumentProxy } from "unpdf";

export type PdfTextItem = {
  pageNumber: number;
  str: string;
  transform: [number, number, number, number, number, number];
  width?: number;
  height?: number;
};

type RawTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

function isRawTextItem(value: unknown): value is RawTextItem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.str === "string" &&
    Array.isArray(candidate.transform) &&
    candidate.transform.length === 6 &&
    candidate.transform.every((part) => typeof part === "number")
  );
}

function toPdfTextItem(
  item: RawTextItem,
  pageNumber: number,
): PdfTextItem | null {
  const transform = item.transform;
  if (transform.length !== 6) return null;

  return {
    pageNumber,
    str: item.str,
    transform: [
      transform[0],
      transform[1],
      transform[2],
      transform[3],
      transform[4],
      transform[5],
    ],
    width: item.width,
    height: item.height,
  };
}

export async function extractTextWithUnpdf(data: ArrayBuffer): Promise<{
  text: string;
  items: PdfTextItem[];
  pageCount: number;
}> {
  const pdf = await getDocumentProxy(new Uint8Array(data));

  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const items: PdfTextItem[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      for (const item of content.items) {
        if (!isRawTextItem(item)) continue;
        const normalized = toPdfTextItem(item, pageNumber);
        if (normalized) items.push(normalized);
      }
    }

    return {
      text,
      items,
      pageCount: totalPages,
    };
  } finally {
    await pdf.destroy();
  }
}
