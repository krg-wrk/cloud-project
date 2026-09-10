#!/usr/bin/env python3
"""
Turn the Proof Points Reviewer workbook into the Hub's seed.

The proof point matching runs outside the Hub — an embedding pass, a rerank
pass, and a two-model agreement score — and lands in a Google Sheet with four
tabs. This reads that workbook and writes the file the Hub's library reads,
gzipped because the rendered proof points are 9 MB of markup on their own.

    python3 tools/extract-proof-points.py ~/Downloads/pp.xlsx

Writes server/src/data/proofPoints.json.gz.

Three things it deliberately drops:

  * `reviewer_email` from the decisions tab. The library needs to know a
    proof point was approved, not who approved it.
  * `trend_title` and `industries` from the queue tab. Both are always the
    trend's own, so they are joined from the trends tab instead of stored ten
    thousand times.
  * `all_trends` titles and URLs, for the same reason.

The rendered HTML is copied through as it stands. It is sanitised on the way
out of the server, not here, so the gate applies whatever the source is —
this file today, a live sheet later.
"""

import gzip
import json
import os
import sys
from datetime import datetime, timezone

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is needed: pip install openpyxl")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "server", "src", "data", "proofPoints.json.gz")


def rows(wb, name):
    """Every row of a tab as a dict, blank rows skipped."""
    ws = wb[name]
    it = ws.iter_rows(values_only=True)
    header = list(next(it))
    for row in it:
        if all(v is None for v in row):
            continue
        yield dict(zip(header, row))


def s(v):
    return "" if v is None else str(v).strip()


def flag(v):
    return s(v).lower() in ("true", "yes", "1")


def number(v):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def pipes(v):
    return [x.strip() for x in s(v).split("|") if x.strip()]


def trend_id(v):
    """The trends tab has "74", the decisions tab has "74.0"."""
    t = s(v)
    return t[:-2] if t.endswith(".0") else t


def build(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

    # The current decision per suggestion. A suggestion can be decided more
    # than once — an undo writes another row — so the latest timestamp wins.
    decided = {}
    for d in rows(wb, "decisions"):
        call = s(d["decision"]).lower()
        if call not in ("approve", "reject"):
            continue
        sid, at = s(d["suggestion_id"]), s(d["decided_at"])
        if sid not in decided or at > decided[sid]["decidedAt"]:
            decided[sid] = {
                "decision": call,
                "decidedAt": at,
                "decidedByOwner": flag(d["is_owner"]),
            }

    trends = [
        {
            "id": trend_id(t["trend_id"]),
            "title": s(t["trend_title"]),
            "description": s(t["description"]),
            "industries": pipes(t["industries"]),
            "total": int(s(t["total_suggestions"]) or 0),
            "tierA": int(s(t["tier_a"]) or 0),
            "ownerName": s(t["owner_name"]),
            "ownerEmail": s(t["owner_email"]).lower(),
            "editorUrl": s(t["link"]),
            "publishedUrl": s(t.get("published_link")),
        }
        for t in rows(wb, "trends")
    ]

    points = []
    for q in rows(wb, "queue"):
        sid = s(q["suggestion_id"])
        mine = trend_id(q["trend_id"])

        # The same data callout matched against other trends, so a person can
        # jump to it there. The row's own trend is in the list and is dropped.
        also = []
        try:
            for a in json.loads(s(q["all_trends"]) or "[]"):
                if trend_id(a.get("id")) == mine:
                    continue
                also.append(
                    {
                        "id": s(a.get("s")),
                        "trendId": trend_id(a.get("id")),
                        "match": int(a.get("p") or 0),
                    }
                )
        except json.JSONDecodeError:
            pass

        tier = s(q["tier"])[:1].upper()
        forecast_title = s(q["forecast_title"])
        reports = pipes(q["report_titles"])

        point = {
            "id": sid,
            "trendId": mine,
            "calloutId": s(q["datacallout_id"]),
            "tier": tier if tier in "ABCD" else "D",
            "match": int(number(q["match_pct"]) or 0),
            "claudeScore": number(q["claude_score"]),
            "geminiScore": number(q["gemini_score"]),
            "agreed": flag(q["agreed"]),
            "forecastTag": s(q["forecast_tag"]),
            "alreadyKnown": flag(q["already_known"]),
            "wgsnData": flag(q["wgsn_data"]),
            "whyClaude": s(q["rationale_claude"]),
            "whyGemini": s(q["rationale_gemini"]),
            "html": s(q["rendered_html"]),
            "text": s(q["plain_text"]),
            "sourceUrl": s(q["source_url"]),
            "forecastUrl": s(q["forecast_url"]),
            "forecastTitle": forecast_title,
            "alsoMatches": also,
        }
        if s(q["forecast_year"]):
            point["forecastYear"] = int(float(s(q["forecast_year"])))
        if s(q["kpi_status"]):
            point["kpiStatus"] = s(q["kpi_status"])
        # Usually the one forecast it came out of, which is already stored.
        if reports != [forecast_title]:
            point["reportTitles"] = reports
        point.update(decided.get(sid, {}))

        # Empties are dropped rather than stored ten thousand times over.
        points.append({k: v for k, v in point.items() if v not in ("", [], None)})

    return {
        "source": "Proof Points Reviewer workbook",
        # When this extract was taken — not when the matching ran, which the
        # workbook does not record. The Hub says which of the two it is.
        "extractedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "trends": trends,
        "points": points,
    }


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip())
    doc = build(sys.argv[1])
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else OUT)
    with gzip.open(out, "wb", compresslevel=9) as f:
        f.write(raw)
    print(
        "%d proof points across %d trends, %d decided\n%s  %.1f MB (%.1f MB gzipped)"
        % (
            len(doc["points"]),
            len(doc["trends"]),
            sum(1 for p in doc["points"] if "decision" in p),
            out,
            len(raw) / 1e6,
            os.path.getsize(out) / 1e6,
        )
    )


if __name__ == "__main__":
    main()
