import { extractText, getDocumentProxy } from "unpdf";

/** Extract plain text from a PDF so it can go through the diary/minutes parser. */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n");
}
