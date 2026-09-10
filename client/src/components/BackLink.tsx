import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../lib/icons";

/**
 * Back to wherever you came from.
 *
 * The browser's own back button works — every view has a real address — but
 * a page you opened from a filtered list needs the affordance on the page,
 * because that is where the eye is. Two cases, and they behave differently on
 * purpose:
 *
 * - You clicked through from somewhere in the app. `navigate(-1)` returns to
 *   that exact view, filters and scroll position included. Rebuilding the
 *   address by hand could not do that: the list's filters are in its query
 *   string and this page does not know them.
 * - You arrived on a pasted link. There is nothing to go back to inside the
 *   app, so it becomes an ordinary link to the list this thing belongs to.
 *
 * `location.key` is the discriminator. React Router gives the first entry in
 * a session the key "default"; anything else means we navigated here.
 */
export default function BackLink({
  to,
  label,
}: {
  /** Where to go when there is no history to go back to. */
  to: string;
  /** What that fallback is called — "Deadlines", "Trends". */
  label: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const came = location.key !== "default";

  return (
    <button
      type="button"
      className="back-link"
      onClick={() => (came ? navigate(-1) : navigate(to))}
      title={came ? "Back to where you were" : `Back to ${label}`}
    >
      <Icon name="back" size={14} />
      {came ? "Back" : label}
    </button>
  );
}
