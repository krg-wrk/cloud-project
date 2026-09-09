import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { useViewer } from "../../lib/viewer";
import { ErrorNote } from "../../components/bits";

/**
 * The studio.
 *
 * Three steps in the order you actually do them: connect to a system, name
 * the table you want out of it, then build a view of that table for a group
 * of people. Each is its own page rather than one long form, because they are
 * done at different times — a connection once, a dataset now and then, views
 * constantly.
 *
 * The server refuses every studio route to anyone but an admin. This check is
 * so the sidebar and the page agree with it, not instead of it.
 */
export default function Studio() {
  const { isAdmin } = useViewer();

  if (!isAdmin) {
    return (
      <ErrorNote message="The studio is open to Hub admins only." />
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <h1 className="page-title">
            <Icon name="studio" size={26} /> Studio
          </h1>
          <p className="page-sub">
            Point the Hub at a data source, then build views of it for whoever needs them —
            without a deploy. Every view gets a real address, so a link to one is a link
            anyone it is meant for can open.
          </p>
        </div>
      </div>

      <nav className="studio-tabs">
        <NavLink to="/studio/connections" className="studio-tab">
          <Icon name="source" size={15} />
          <span>
            <b>1. Connections</b>
            <em>Where data comes from</em>
          </span>
        </NavLink>
        <NavLink to="/studio/datasets" className="studio-tab">
          <Icon name="table" size={15} />
          <span>
            <b>2. Datasets</b>
            <em>Which table, and its columns</em>
          </span>
        </NavLink>
        <NavLink to="/studio/views" className="studio-tab">
          <Icon name="eye" size={15} />
          <span>
            <b>3. Views</b>
            <em>What people see</em>
          </span>
        </NavLink>
      </nav>

      <Outlet />
    </>
  );
}
