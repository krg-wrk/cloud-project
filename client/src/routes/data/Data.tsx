import { Link } from "react-router-dom";
import { useApi } from "../../lib/api";
import { Slot } from "../../lib/custom";
import { Icon } from "../../lib/icons";

/**
 * Data: the things the team works out about the team's work.
 *
 * Not the schedule and not the profiles — those have their own pages. This is
 * for the analysis that sits beside them, of which the proof point library is
 * the first. It is a section rather than a page because more is coming, and
 * because a forecaster looking for evidence should not have to know which
 * project produced it.
 */

interface About {
  source: string;
  points: number;
  trends: number;
}

const VIEWS: { to: string; icon: string; label: string; blurb: string }[] = [
  {
    to: "/data/proof-points",
    icon: "proof",
    label: "Proof Point Library",
    blurb:
      "Every data callout we hold, matched against every trend profile by two models working " +
      "independently. Filter it, read the reasoning, copy what you need into a forecast.",
  },
];

export default function Data() {
  const about = useApi<About>("/proof-points/about");

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="data.eyebrow" as="div" className="eyebrow" />
          <Slot id="data.title" as="h1" className="page-title" />
          <Slot id="data.sub" as="p" className="page-sub" />
        </div>
      </div>

      <div className="view-grid">
        {VIEWS.map((v) => (
          <Link className="view-card" to={v.to} key={v.to}>
            <div className="view-card-head">
              <Icon name={v.icon} size={18} />
              <h2>{v.label}</h2>
            </div>
            <p className="muted">{v.blurb}</p>
            {v.to === "/data/proof-points" && about.data && (
              <p className="view-card-figure">
                <b>{about.data.points.toLocaleString()}</b> suggestions across{" "}
                <b>{about.data.trends}</b> trends
              </p>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
