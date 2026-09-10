import { useApi } from "../lib/api";
import { Icon } from "../lib/icons";
import type { FreshnessReport } from "../types";
import { ago } from "../routes/studio/Freshness";

/**
 * How old the schedule is, at the foot of the page.
 *
 * One line, and only when somebody has asked for it: an admin always, and
 * everybody else when an admin has turned it on. The endpoint refuses
 * otherwise, so a forecaster's Hub simply has nothing here rather than a
 * control they cannot use.
 *
 * The schedule is the one worth surfacing — it is the thing people work
 * against, and the thing a manager corrects in Smartsheet while somebody else
 * is reading it. The rest of the report lives in the studio.
 */
export default function FreshnessNote() {
  const report = useApi<FreshnessReport>("/freshness");
  // A 403 is the ordinary answer here, not a fault worth reporting.
  if (report.error || !report.data) return null;

  const schedule = report.data.reads.find((r) => r.key === "content");
  if (!schedule) return null;

  const stale = schedule.ageMs > schedule.cacheMs;
  return (
    <p className={stale ? "freshness-note stale" : "freshness-note"}>
      <Icon name="refresh" size={12} />
      Schedule read {ago(schedule.ageMs)} ago
      {stale ? " — due again on the next request" : ""}
      {report.data.writes ? "" : " · the Hub only reads it"}
    </p>
  );
}
