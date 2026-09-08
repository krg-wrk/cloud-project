import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout";
import CalendarView from "./routes/CalendarView";
import ContentDetail from "./routes/ContentDetail";
import Deadlines from "./routes/Deadlines";
import Kpis from "./routes/Kpis";
import SessionDetail from "./routes/SessionDetail";
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
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
