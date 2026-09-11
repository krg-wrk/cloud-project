/**
 * The WGSN wordmark, as supplied by the brand team.
 *
 * Inlined rather than loaded as a file for two reasons. It has to take the
 * ink colour of whatever it sits on — the sidebar is white in one theme and
 * near-black in the other, and a PNG of black letters disappears into the
 * second — which `currentColor` does and an `<img>` cannot. And the demo is a
 * single file that gets emailed around, so a logo that lives at a URL is a
 * logo that is missing the moment somebody opens it on a train.
 *
 * The paths are the artwork untouched, straight out of `WGSN_logo_black.svg`.
 * The only changes are the ones that make it behave as a glyph: the fill is
 * dropped so it inherits, and the `<title>` gives it a name for anybody who
 * cannot see it.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1020.47 255.12"
      fill="currentColor"
      role="img"
      aria-label="WGSN"
    >
      <polygon points="226.69,249.16 165.55,117.98 164.89,117.98 103.41,249.16 96.81,249.16 8.26,9.28 64.75,9.28 105.73,129.87 107.06,129.87 162.22,9.28 168.52,9.28 224.03,130.22 225.34,130.22 266.65,9.28 321.14,9.28 233.28,249.16" />
      <polygon points="963.32,8.95 963.32,144.43 816.96,8.29 806.02,8.29 806.02,245.84 855.6,245.84 855.6,111.39 856.58,111.39 1001.97,248.17 1012.21,248.17 1012.21,8.95" />
      <polygon points="459.41,104.45 459.41,150.04 512.28,150.04 512.28,203.23 559.54,203.23 559.54,104.45" />
      <path d="M390.38,127.58c0-41.98,32.4-72.38,80.27-72.38h8.29V3.66h-7.96c-77.64,0-132.14,52.22-132.14,123.92 c0,71.35,54.5,123.88,132.14,123.88h7.96V199.6h-8.29C422.78,199.6,390.38,169.53,390.38,127.58" />
      <path d="M605.45,175.47c16.86,16.18,45.28,27.08,68.43,27.08c20.8,0,35-10.54,35-25.74c0-16.86-18.51-23.13-42.95-33.05 c-25.11-9.92-63.1-25.79-63.1-69.06c0-37.35,31.04-71.05,84.25-71.05c19.81,0,44.95,6.28,60.46,15.2V71.4 c-15.19-11.57-38.33-19.5-56.5-19.5c-23.44,0-36.01,9.93-36.01,22.48c0,13.55,14.2,19.82,34.03,27.43 c30.39,11.57,74.01,25.78,74.01,72.69c0,39.99-32.71,76.65-87.87,76.65c-25.8,0-53.23-8.26-69.75-20.15V175.47z" />
    </svg>
  );
}
