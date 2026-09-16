import { useState } from "react";
import { Link } from "react-router-dom";
import { send, useApi } from "../../lib/api";
import { Slot } from "../../lib/custom";
import { Icon } from "../../lib/icons";
import { announceAccountChange, useViewer } from "../../lib/viewer";
import { usePreferences, writePreferences } from "../../lib/preferences";
import { useAppearance } from "../../lib/appearance";
import type { Me } from "../../types";
import AlertSettings from "./Alerts";
import Photo from "./Photo";
import PageIntro from "../../components/PageIntro";
import { announceSavedChange, useSavedViews } from "../../components/SaveView";

/**
 * Everything a person can set for themselves, on one page.
 *
 * One page with sections rather than a page each: there are four of these and
 * there will never be forty, and a settings area you have to navigate is
 * worse than a settings page you scroll. The sections are linked from the top
 * so the page is still addressable — /settings#alerts is a place you can send
 * somebody.
 *
 * What is *not* here is anything about somebody else, or about the Hub as a
 * whole. Colours, wording, who may sign in and what the menu says are the
 * studio's, which is an admin's job and lives behind its own door.
 */

const ROLE_LABELS: Record<Me["role"], string> = {
  forecaster: "Forecaster",
  "commissioning-manager": "Commissioning manager",
  admin: "Admin",
};

const SECTIONS = [
  { id: "you", label: "You" },
  { id: "alerts", label: "Alerts" },
  { id: "saved", label: "Saved views" },
  { id: "look", label: "How it looks" },
  { id: "calendar", label: "Your calendar" },
];

export default function Settings() {
  const { me, person } = useViewer();
  // The account, read again here so a new photograph shows the moment it is
  // saved rather than after a reload. The layout has its own copy; the event
  // below is what keeps the sidebar's avatar in step.
  const account = useApi<Me>("/me");
  const mine = usePreferences();
  const look = useAppearance();

  const self = account.data?.person ?? person;
  const washOffByAdmin = look.gradients === false;

  return (
    <>
      <div className="page-head">
        <div>
          <Slot id="settings.eyebrow" as="div" className="eyebrow" />
          <Slot id="settings.title" as="h1" className="page-title" />
          <PageIntro>
            Your photograph, which alerts reach you and how the Hub looks on this screen.
            Everything here is yours alone &mdash; nobody else sees a change you make on this
            page, except your photograph.
          </PageIntro>
        </div>
      </div>

      <nav className="settings-jump" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="settings-jump-link">
            {s.label}
          </a>
        ))}
      </nav>

      <section className="settings-section" id="you">
        <div className="section-head">
          <h2>You</h2>
        </div>
        <div className="card">
          {self ? (
            <Photo
              person={self}
              onChanged={() => {
                account.reload();
                // And the layout, which holds the avatar in the sidebar and
                // the team list every other avatar is drawn from.
                announceAccountChange();
              }}
            />
          ) : (
            <p className="studio-note">
              This account is signed in but is not on the forecast team&rsquo;s list, so there
              is no profile to set a photograph on.
            </p>
          )}

          <dl className="settings-facts">
            <div>
              <dt>Name</dt>
              <dd>{me.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{me.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{ROLE_LABELS[me.role]}</dd>
            </div>
            {self?.forecasterRole && (
              <div>
                <dt>Level</dt>
                <dd>{self.forecasterRole}</dd>
              </div>
            )}
            {self?.department && (
              <div>
                <dt>Department</dt>
                <dd>{self.department}</dd>
              </div>
            )}
            {self?.region && (
              <div>
                <dt>Region</dt>
                <dd>{self.region}</dd>
              </div>
            )}
          </dl>
          <p className="muted small">
            Your name, role and department come from the team&rsquo;s own records rather than
            from the Hub, so they are read here and changed there. Your photograph is the
            Hub&rsquo;s, and yours.
          </p>
        </div>
      </section>

      <section className="settings-section" id="alerts">
        <div className="section-head">
          <h2>Alerts</h2>
        </div>
        <AlertSettings />
      </section>

      <section className="settings-section" id="saved">
        <div className="section-head">
          <h2>Saved views</h2>
        </div>
        <SavedViews />
      </section>

      <section className="settings-section" id="look">
        <div className="section-head">
          <h2>How it looks</h2>
        </div>
        <div className="card">
          <h2 className="card-title">On this screen</h2>
          <p className="muted small">
            Kept in this browser rather than on your account, because it is a setting about the
            screen in front of you: change it on a laptop and your phone is untouched.
          </p>
          <label className="check gradient-switch">
            <input
              type="checkbox"
              checked={mine.wash !== "off" && !washOffByAdmin}
              disabled={washOffByAdmin}
              onChange={(e) =>
                writePreferences({ ...mine, wash: e.target.checked ? "default" : "off" })
              }
            />
            <span>
              <b>Iridescent wash behind the pages</b>
              <small>
                {washOffByAdmin
                  ? "Turned off for everybody in the studio, so there is nothing to switch here."
                  : "A very pale field of colour that stays put while the page scrolls, and a gradient behind each page title. Off gives you flat paper."}
              </small>
            </span>
          </label>
          {mine.wash === "off" && !washOffByAdmin && (
            <p className="studio-note">
              Off, for you, in this browser. Everybody else still sees whatever the studio set.
            </p>
          )}

          <label className="check gradient-switch">
            <input
              type="checkbox"
              checked={mine.intros === "on"}
              onChange={(e) =>
                writePreferences({ ...mine, intros: e.target.checked ? "on" : "off" })
              }
            />
            <span>
              <b>The explanation under each page title</b>
              <small>
                Every page can say what it is for in a sentence or two. Off, that sits behind
                a small button and the page starts with the work. The button is on every page,
                so this is the same switch — it is here as well because a setting you found by
                accident is one you cannot find again.
              </small>
            </span>
          </label>
        </div>
      </section>

      <section className="settings-section" id="calendar">
        <div className="section-head">
          <h2>Your calendar</h2>
        </div>
        <div className="card">
          <h2 className="card-title">Deadlines in your own calendar</h2>
          <p className="muted small">
            Your submission and publication dates, as a feed Google Calendar or Outlook can
            subscribe to. The address is private to you and can be reissued if it gets out.
          </p>
          <p>
            <Link className="btn" to="/subscribe">
              <Icon name="subscribe" size={15} /> Set up the feed
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

/**
 * Every filtered page this person has named, in one place.
 *
 * The star beside a page is where saving happens; this is where a list of
 * forty of them gets tidied. Removing is the only action here — renaming
 * belongs beside the thing being renamed, where you can see what it holds.
 */
function SavedViews() {
  const saved = useSavedViews();
  const [busy, setBusy] = useState("");
  const rows = saved.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="card">
        <p className="studio-note">
          None yet. Filter any list — the deadlines, the calendar, a view built in the studio —
          and press <b>Save this view</b> beside it. What gets saved is the address rather than
          the rows, so it opens whatever is true on the day you come back.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <ul className="saved-rows">
        {rows.map((v) => (
          <li key={v.id}>
            <Link to={v.path} className="saved-row-link">
              <Icon name="score" size={13} />
              <span>
                <b>{v.label}</b>
                <small>{v.path}</small>
              </span>
            </Link>
            <button
              className="btn small danger"
              disabled={busy === v.id}
              onClick={async () => {
                setBusy(v.id);
                try {
                  await send(`/saved-views/${v.id}`, "DELETE");
                  announceSavedChange();
                } finally {
                  setBusy("");
                }
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
