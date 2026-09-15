import { useId, useState, type ReactNode } from "react";
import { Icon } from "../lib/icons";
import { PREFERENCES_CHANGED, usePreferences, writePreferences } from "../lib/preferences";

/**
 * The paragraph under a page title, out of the way until it is wanted.
 *
 * Every page opened with three or four lines explaining itself. That is right
 * on the first visit and wrong on the four hundredth: it pushed the thing
 * people came for a screen down, every time, for ever. Deleting them was the
 * other option and it is worse — somebody meets each of these pages once, and
 * a page that explains nothing is a page somebody has to be told about.
 *
 * So the words stay and the space does not. Collapsed, this is one small
 * button; opened, it is the paragraph it always was. The choice is
 * remembered, so it is made once rather than per page: open one and they are
 * all open, close one and they are all shut.
 *
 * Shut by default, because the people who use the Hub every day outnumber the
 * people meeting it — and the ones meeting it have a button in front of them
 * that says what it does.
 */
export default function PageIntro({ children }: { children: ReactNode }) {
  const prefs = usePreferences();
  const open = prefs.intros === "on";
  const id = useId();
  // Kept locally as well as in preferences so the button reacts instantly
  // rather than waiting for the storage event to come back round.
  const [, force] = useState(0);

  const toggle = () => {
    writePreferences({ ...prefs, intros: open ? "off" : "on" });
    force((n) => n + 1);
  };

  return (
    <div className={open ? "page-intro open" : "page-intro"}>
      <button
        className="page-intro-toggle"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <Icon name="info" size={13} />
        {open ? "Hide this" : "What this page is for"}
      </button>
      {/*
        Rendered either way and hidden with an attribute rather than removed,
        so the words are in the document for anything that reads it — a search
        in the browser, a screen reader in browse mode — instead of existing
        only once somebody has pressed a button.
      */}
      <p className="page-sub" id={id} hidden={!open}>
        {children}
      </p>
    </div>
  );
}

/** Said when the preference changes, so every page head on screen keeps up. */
export { PREFERENCES_CHANGED };
