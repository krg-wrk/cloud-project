/**
 * Taking a list out of the Hub.
 *
 * Done in the browser rather than on the server, and deliberately: what
 * somebody wants when they press Export is *the list they are looking at*,
 * filters and sort and all. The server would have to be told all of that
 * again to reproduce it, and the first time the two drifted apart the export
 * would quietly be of something else.
 *
 * So the rule is: the file holds exactly what the screen holds. If the page
 * is showing forty of four hundred because a filter says so, the file has
 * forty rows.
 */

/** A column: the heading it gets, and how to read it off a row. */
export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * One cell, escaped.
 *
 * The three things that break a CSV are a comma, a quote and a newline, and
 * the fix for all three is the same: wrap in quotes and double any quote
 * inside. A leading `=`, `+`, `-` or `@` is the fourth, and is not a
 * formatting problem — Excel and Sheets both execute it. A cell reading
 * `=HYPERLINK(...)` in an exported schedule is a formula injection, so
 * anything starting that way gets a leading apostrophe and is shown as text.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows and columns, as the text of a CSV file. */
export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(","));
  }
  // CRLF, which is what the spec says and what Excel is happiest with.
  return lines.join("\r\n");
}

/** A filename nothing will object to, with today's date on it. */
export function csvName(label: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const stem = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${stem || "export"}-${day}.csv`;
}

/**
 * Hand the file to the browser.
 *
 * The byte order mark is the difference between an export somebody can use
 * and one they complain about: without it Excel on Windows reads UTF-8 as
 * Latin-1, and every name with an accent in it arrives mangled. Sheets and
 * Numbers do not need it and do not mind it.
 *
 * Returns false where the browser refused — a sandboxed frame blocks
 * downloads the page starts itself, which is exactly the shareable demo — so
 * the caller can offer the text some other way rather than appearing to do
 * nothing.
 */
export function downloadCsv(text: string, filename: string): boolean {
  try {
    const blob = new Blob([`\ufeff${text}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Let the download start before the handle goes.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
