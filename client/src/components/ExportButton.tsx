import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../lib/icons";
import { useDialog } from "../lib/dialog";
import { csvName, downloadCsv, toCsv, type Column } from "../lib/csv";

/**
 * Export, beside whatever it exports.
 *
 * The count is in the label on purpose. "Export" alone invites somebody to
 * press it expecting the whole sheet and open a file with the nine rows their
 * filter left — saying "Export 9 rows" before they press it is the difference
 * between a feature and a support question.
 *
 * Where the browser refuses the download — a sandboxed frame, which is what
 * the shareable demo is — the text is offered instead, so the button never
 * simply does nothing.
 */
export default function ExportButton<T>({
  rows,
  columns,
  label,
  small,
}: {
  rows: T[];
  columns: Column<T>[];
  /** What is being exported, used for the filename: "Deadlines", "The team". */
  label: string;
  small?: boolean;
}) {
  const [fallback, setFallback] = useState<string | null>(null);

  if (rows.length === 0) return null;

  return (
    <>
      <button
        className={small ? "btn small" : "btn"}
        onClick={() => {
          const text = toCsv(rows, columns);
          if (!downloadCsv(text, csvName(label))) setFallback(text);
        }}
      >
        <Icon name="download" size={15} /> Export {rows.length}{" "}
        {rows.length === 1 ? "row" : "rows"}
      </button>
      {fallback !== null && (
        <CsvFallback text={fallback} label={label} onClose={() => setFallback(null)} />
      )}
    </>
  );
}

/**
 * The file, as text, when the browser will not save it.
 *
 * Not an error message: the data is right there and copying it into a
 * spreadsheet is two keystrokes. Selected on open so the first of those two
 * is already done.
 */
function CsvFallback({
  text,
  label,
  onClose,
}: {
  text: string;
  label: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useDialog(box, onClose);

  return createPortal(
    <>
      <button className="pp-scrim" aria-label="Close" onClick={onClose} />
      <div
        className="pp-dialog csv-dialog"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} as CSV`}
      >
        <div className="pp-dialog-head">
          <h2>{label}, as CSV</h2>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          This page cannot save a file to your computer &mdash; it is running inside a shared
          preview. Copy the text and paste it into a blank spreadsheet; the columns land in the
          right places.
        </p>
        <textarea
          ref={area}
          className="csv-text"
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
        />
        <button
          className="btn accent"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              area.current?.select();
            }
          }}
        >
          {copied ? "Copied" : "Copy it all"}
        </button>
      </div>
    </>,
    document.body,
  );
}
