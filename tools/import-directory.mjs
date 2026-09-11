/**
 * Turn a Content Directory export into something the Hub can read, without
 * ever putting it in the repository.
 *
 *   node tools/import-directory.mjs ~/Downloads/Content_Directory_2026.xlsx
 *   npm run dev            # the Hub picks it up
 *
 * It writes `data/directory.json`, which is git-ignored. The server reads that
 * file if it is there and falls back to the invented directory in
 * `server/src/data/directory.ts` if it is not — so a checkout, a colleague's
 * laptop and the shareable demo all carry made-up people, and the real hundred
 * and fifty only ever exist on a machine somebody deliberately put them on.
 *
 * This is the stop-gap. The real answer is `SMARTSHEET_DIRECTORY_SHEET_ID`,
 * which reads the sheet directly and needs no file at all; the columns are
 * mapped in one place (`COLUMNS` in server/src/directory.ts) and both paths go
 * through it.
 *
 * Takes .xlsx or .csv. The only dependency is the zip and XML already in Node,
 * because a tool that needs a package installed to run once is a tool nobody
 * runs.
 */

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const file = process.argv[2];
const out = resolve(process.argv[3] ?? "data/directory.json");

if (!file) {
  console.error("Which file? node tools/import-directory.mjs <export.xlsx|.csv> [out.json]");
  process.exit(1);
}

/** A CSV row reader that copes with quoted cells containing commas and newlines. */
function readCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * An .xlsx is a zip of XML. Rather than carry a spreadsheet library for one
 * job, this shells out to Python's openpyxl when it is there — every machine
 * that has run the proof point extractor has it — and says so plainly when it
 * is not, with the one-line alternative.
 */
function readXlsx(path) {
  const script = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
rows = [[("" if c is None else str(c)) for c in r] for r in ws.iter_rows(values_only=True)]
json.dump(rows, sys.stdout)
`;
  try {
    const json = execFileSync("python3", ["-c", script, path], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(json);
  } catch (err) {
    console.error("Could not read the spreadsheet:", err.message.split("\n")[0]);
    console.error("Either `pip install openpyxl`, or save the sheet as CSV and pass that.");
    process.exit(1);
  }
}

const grid = /\.csv$/i.test(file) ? readCsv(readFileSync(file, "utf8")) : readXlsx(file);
if (!grid.length) {
  console.error("That file has no rows in it.");
  process.exit(1);
}

const header = grid[0].map((h) => String(h ?? "").trim());
const rows = grid
  .slice(1)
  .map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])))
  // Spacer rows: the sheet has them, and they are not people.
  .filter((row) => String(row.Name ?? "").trim());

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(rows, null, 2));

/*
 * Say what was read and what was missing, because the useful answer to "is
 * the directory right" is a column that is empty for half the team.
 */
const { COLUMNS } = require("../server/dist/directory.js");
const missing = Object.entries(COLUMNS)
  .filter(([, title]) => !header.includes(title))
  .map(([, title]) => title);
const empty = Object.entries(COLUMNS)
  .map(([, title]) => [title, rows.filter((r) => !String(r[title] ?? "").trim()).length])
  .filter(([, n]) => n > rows.length / 2);

console.log(`${rows.length} people → ${out}`);
if (missing.length) console.log(`  columns the Hub looks for and the sheet has not got: ${missing.join(", ")}`);
for (const [title, n] of empty) console.log(`  ${title} is empty for ${n} of ${rows.length}`);
console.log("  git ignores this file. Run the Hub and it will be read instead of the invented one.");
