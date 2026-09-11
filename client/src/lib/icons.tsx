/**
 * The icon set.
 *
 * One 24x24 grid, stroked in currentColor, no fills — so an icon takes the
 * colour and weight of the text beside it and needs no per-theme variant.
 * Every icon here earns its place by standing for one thing (a section, a
 * status, a kind of diary entry); nothing is decorative.
 *
 * Kept in step with the copy in demo/hub.template.html by hand, the same way
 * types.ts is. Worth promoting to a shared workspace package with the types
 * once the shape settles.
 */

export const ICON_PATHS: Record<string, string> = {
  // Sections
  today: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  deadlines: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  calendar: "M3 9h18M7 3v3M17 3v3M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  performance: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  trends: "M3 17l5-6 4 3 5-7M14 7h4v4",
  learning: "M12 4 2 9l10 5 10-5-10-5ZM6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5",
  forecasters:
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.5 3.5 0 0 1 0 6.6",
  "whats-on": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3c-2.5 2.4-3.8 5.4-3.8 9s1.3 6.6 3.8 9c2.5-2.4 3.8-5.4 3.8-9S14.5 5.4 12 3Z",
  subscribe: "M3 9h18M7 3v3M17 3v3M12 13v5M9.5 15.5h5M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  bell: "M18 9a6 6 0 0 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9ZM13.7 19a2 2 0 0 1-3.4 0",
  mail: "M3.5 6h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM3 7l9 6 9-6",
  chat: "M21 12a8 8 0 0 1-8 8H8l-5 3 1.3-4.4A8 8 0 0 1 13 4a8 8 0 0 1 8 8ZM9 11h.01M13 11h.01M17 11h.01",
  send: "M21.5 3 2.5 10.5l7 2.5 2.5 7L21.5 3ZM9.5 13l4-4",

  // Statuses
  "not-started": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  "in-progress": "M7 3h10M7 21h10M8.5 3v3.3c0 1.3 3.5 3.4 3.5 5.7s-3.5 4.4-3.5 5.7V21M15.5 3v3.3c0 1.3-3.5 3.4-3.5 5.7s3.5 4.4 3.5 5.7V21",
  submitted: "M12 15V3M8 7l4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  "in-review": "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  published: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 12.5l2.5 2.5 4.5-5",
  "at-risk": "M12 9v4M12 17h.01M10.3 3.9 2.4 17.4A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z",

  // Diary
  leave: "M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M9 12v4M15 12v4",
  "public-holiday": "M5 21V3M5 4h11l-1.5 4L16 12H5",
  workshop: "M4 4h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM12 15v3M8 21l4-3 4 3M7.5 8.5l2 2 3.5-4",
  training: "M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5v-15ZM4 17h15M9 7h6",
  conference: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6",

  // Bits and pieces
  link: "M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  image: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm-1 12 4.5-4.5 4 4 3-3L20 15M9.5 9.5h.01",
  note: "M14 3v5h5M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8.5 12h7M8.5 16h4",
  ai: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z",
  review: "M9 11.5l2.5 2.5 5-5M7 4h10a2 2 0 0 1 2 2v14l-3.5-2.5L12 20l-3.5-2.5L5 20V6a2 2 0 0 1 2-2Z",
  tier: "M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5",
  clock: "M12 7.5V12l3 1.8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  plus: "M12 5v14M5 12h14",
  edit: "M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L15.5 4.5ZM14 6l4 4",

  // The studio. The five layouts double as the layout picker's own icons, so
  // the choice reads as a shape rather than a word.
  studio: "M4 7h7M15 7h5M4 17h5M13 17h7M13 4.5v5M9 14.5v5",
  source:
    "M12 8.5c4.4 0 8-1.2 8-2.75S16.4 3 12 3 4 4.2 4 5.75 7.6 8.5 12 8.5ZM4 5.75v12.5C4 19.8 7.6 21 12 21s8-1.2 8-2.75V5.75M4 12c0 1.55 3.6 2.75 8 2.75s8-1.2 8-2.75",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14",
  cards: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M4 6h16M4 12h16M4 18h10",
  board: "M4 4h5v16H4zM10.5 4h5v10h-5zM17 4h3v13h-3z",
  refresh: "M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6",
  trash: "M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10.5 11v5M13.5 11v5",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  lock: "M7 10.5V7.5a5 5 0 0 1 10 0v3M5.5 10.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  people: "M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-7A3.5 3.5 0 0 0 3 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-2a3.5 3.5 0 0 0-2.2-3.2",
  back: "M19 12H5M11 18l-6-6 6-6",
  data: "M4 6.5C4 5.1 7.6 4 12 4s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5ZM4 6.5v11C4 18.9 7.6 20 12 20s8-1.1 8-2.5v-11M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5M9 16.5h.01M12 16.5h.01",
  proof: "M9 12.5l2 2 4.5-4.5M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  copy: "M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15M5.5 9h8A1.5 1.5 0 0 1 15 10.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9Z",
};

export type IconName = keyof typeof ICON_PATHS | string;

/**
 * An icon is presentational by default: the label beside it carries the
 * meaning. Pass `label` only where the icon stands alone.
 */
export function Icon({
  name,
  size = 16,
  label,
  className,
}: {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <path d={path} />
    </svg>
  );
}
