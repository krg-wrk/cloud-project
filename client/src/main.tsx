import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout";
import CalendarView from "./routes/CalendarView";
import ContentDetail from "./routes/ContentDetail";
import CustomView from "./routes/CustomView";
import Data from "./routes/data/Data";
import ProofPoints from "./routes/data/ProofPoints";
import Review from "./routes/data/Review";
import Deadlines from "./routes/Deadlines";
import Kpis from "./routes/Kpis";
import SessionDetail from "./routes/SessionDetail";
import Studio from "./routes/studio/Studio";
import Connections from "./routes/studio/Connections";
import Datasets from "./routes/studio/Datasets";
import Freshness from "./routes/studio/Freshness";
import Views from "./routes/studio/Views";
import Pages from "./routes/studio/Pages";
import Subscribe from "./routes/Subscribe";
import { TeamList, TeamMember } from "./routes/Team";
import Today from "./routes/Today";
import TrendDetail from "./routes/TrendDetail";
import Trends from "./routes/Trends";
import WhatsOn from "./routes/WhatsOn";
import Workshops from "./routes/Workshops";
import { TODAY, monthKey } from "./lib/date";
import "./index.css";

/**
 * Every view has a real, linkable address — the thing AppSheet could not give
 * us. Filters live in the query string so a filtered view is shareable too.
 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Today /> },
      { path: "deadlines", element: <Deadlines /> },
      { path: "calendar", element: <Navigate to={`/calendar/${monthKey(TODAY)}`} replace /> },
      { path: "calendar/:month", element: <CalendarView /> },
      { path: "content/:id", element: <ContentDetail /> },
      { path: "team", element: <TeamList /> },
      { path: "team/:id", element: <TeamMember /> },
      { path: "workshops", element: <Workshops /> },
      { path: "workshops/:id", element: <SessionDetail /> },
      { path: "whats-on", element: <WhatsOn /> },
      { path: "performance", element: <Kpis /> },
      { path: "trends", element: <Trends /> },
      { path: "trends/:id", element: <TrendDetail /> },
      { path: "subscribe", element: <Subscribe /> },

      // Data: the analysis that sits beside the schedule. The library's
      // filters — and which proof point is enlarged — are all in the query
      // string, so any state of it is a link.
      { path: "data", element: <Data /> },
      { path: "data/proof-points", element: <ProofPoints /> },
      { path: "data/review", element: <Review /> },

      // Views built in the studio. One route, one renderer, any layout — a
      // custom view is as linkable as a hand-written page.
      { path: "v/:slug", element: <CustomView /> },

      {
        path: "studio",
        element: <Studio />,
        children: [
          { index: true, element: <Navigate to="/studio/connections" replace /> },
          { path: "connections", element: <Connections /> },
          { path: "datasets", element: <Datasets /> },
          { path: "views", element: <Views /> },
          { path: "freshness", element: <Freshness /> },
          { path: "pages", element: <Pages /> },
        ],
      },

      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
