export type EntryFiletype = "xml" | "csv";

const WINDOWS_ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const XML_ROOT_TAG = /^<\s*([A-Za-z_][\w.-]*)/;

export const detectFiletype = (content: string): EntryFiletype =>
  content.trimStart().startsWith("<") ? "xml" : "csv";

export const entryFileName = (content: string): string => {
  const filetype = detectFiletype(content);
  const baseName =
    filetype === "xml"
      ? (content.trimStart().match(XML_ROOT_TAG)?.[1] ?? "entry")
      : (content.split("\n", 1)[0] ?? "").replaceAll("\r", "");

  return `${baseName.replace(WINDOWS_ILLEGAL_FILENAME_CHARS, "_")}.${filetype}`;
};
