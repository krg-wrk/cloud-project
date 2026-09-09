import { useState, type CSSProperties } from "react";
import { personHue } from "../lib/domain";
import { Icon } from "../lib/icons";

/**
 * A trend profile's cover image.
 *
 * The stand-in is the floor rather than a replacement. A cover is linked from
 * the sheet and lives on the platform's media host, so it may be missing,
 * still loading, or unreachable. The gradient takes a hue from the trend's
 * own id — the same one every time, so a profile stays recognisable — and a
 * linked image simply covers it.
 *
 * Because the stand-in is always there, the image can load lazily without a
 * blank frame in the meantime, which matters on a list of 446 profiles.
 */
export function TrendImage({
  trendId,
  name,
  imageUrl,
  imageCredit,
  ratio = "16 / 10",
  eager,
}: {
  trendId: string;
  name: string;
  imageUrl?: string;
  imageCredit?: string;
  ratio?: string;
  /** The lead image on a profile page is the one worth fetching straight away. */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const style = { aspectRatio: ratio, "--hue": personHue(trendId) } as CSSProperties;

  return (
    <figure className="trend-image" style={style}>
      <span className="cover-fallback" aria-hidden>
        <Icon name="image" size={20} />
        <span>{imageUrl ? "Cover image did not load" : "No image linked"}</span>
      </span>
      {imageUrl && !failed && (
        <img
          src={imageUrl}
          alt={name}
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      )}
      {imageCredit && !failed && imageUrl && <figcaption>{imageCredit}</figcaption>}
    </figure>
  );
}
