import {
  lazy,
  StrictMode,
  Suspense,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Brand } from "./components/Brand";
import { Layout } from "./components/Layout";
import { ButtonLink, Loading, ToastHost } from "./components/ui";
import { DEMO } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth";
import { applyInitialTheme } from "./lib/theme";
import type { Role } from "@suraj/shared";
import "./styles.css";

/**
 * Pages load on first visit, so the website and the driver app download only what they show.
 * After a new release the old file names are gone; reload once to pick up the new ones.
 */
function page<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
) {
  return lazy(() =>
    load().then(
      (m) => {
        try {
          sessionStorage.removeItem("sl_reloaded");
        } catch {
          /* storage blocked */
        }
        return { default: m[name] };
      },
      (err) => {
        let again = false;
        try {
          again = sessionStorage.getItem("sl_reloaded") !== "1";
          sessionStorage.setItem("sl_reloaded", "1");
        } catch {
          /* storage blocked */
        }
        if (again && !DEMO) window.location.reload();
        throw err;
      },
    ),
  );
}

const Billing = page(() => import("./pages/Billing"), "Billing");
const BulkUpload = page(() => import("./pages/BulkUpload"), "BulkUpload");
const ControlTower = page(() => import("./pages/ControlTower"), "ControlTower");
const Customers = page(() => import("./pages/Customers"), "Customers");
const DriverApp = page(() => import("./pages/DriverApp"), "DriverApp");
const Fleet = page(() => import("./pages/Fleet"), "Fleet");
const Login = page(() => import("./pages/Login"), "Login");
const Landing = page(() => import("./pages/Landing"), "Landing");
const Marketplace = page(() => import("./pages/Marketplace"), "Marketplace");
const Messages = page(() => import("./pages/Messages"), "Messages");
const NewShipment = page(() => import("./pages/NewShipment"), "NewShipment");
const Profile = page(() => import("./pages/Profile"), "Profile");
const PartnerApp = page(() => import("./pages/PartnerApp"), "PartnerApp");
const Requests = page(() => import("./pages/Requests"), "Requests");
const Reports = page(() => import("./pages/Reports"), "Reports");
const RoutePlanner = page(() => import("./pages/RoutePlanner"), "RoutePlanner");
const SettingsPage = page(() => import("./pages/Settings"), "SettingsPage");
const ShipmentDetail = page(
  () => import("./pages/ShipmentDetail"),
  "ShipmentDetail",
);
const Shipments = page(() => import("./pages/Shipments"), "Shipments");
const About = page(() => import("./pages/About"), "About");
const Features = page(() => import("./pages/Features"), "Features");
const Join = page(() => import("./pages/Join"), "Join");
const Send = page(() => import("./pages/Send"), "Send");
const TruckOwners = page(() => import("./pages/TruckOwners"), "TruckOwners");
const Team = page(() => import("./pages/Team"), "Team");
const Track = page(() => import("./pages/Track"), "Track");
const TripDetail = page(() => import("./pages/TripDetail"), "TripDetail");
const Trips = page(() => import("./pages/Trips"), "Trips");
const Warehouse = page(() => import("./pages/Warehouse"), "Warehouse");
const PrintInvoice = page(() => import("./pages/Print"), "PrintInvoice");
const PrintLabel = page(() => import("./pages/Print"), "PrintLabel");
const PrintLabels = page(() => import("./pages/Print"), "PrintLabels");
const PrintLR = page(() => import("./pages/Print"), "PrintLR");

applyInitialTheme();

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/welcome" replace />;
  if (user.role === "driver") return <Navigate to="/driver" replace />;
  if (user.role === "partner") return <Navigate to="/partner" replace />;
  if (user.role === "warehouse") return <Navigate to="/warehouse" replace />;
  if (user.role === "customer") return <Navigate to="/shipments" replace />;
  return <ControlTower />;
}

function Guard({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading rows={6} />;
  // Signed-out visitors to the front door see the website; deep links ask them to log in.
  if (!user)
    return (
      <Navigate to={loc.pathname === "/" ? "/welcome" : "/login"} replace />
    );
  if (roles && !roles.includes(user.role)) return <NoAccess />;
  return <>{children}</>;
}

function Public({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (user)
    return (
      <Navigate
        to={
          user.role === "driver"
            ? "/driver"
            : user.role === "partner"
              ? "/partner"
              : "/"
        }
        replace
      />
    );
  return <>{children}</>;
}

function NoAccess() {
  return (
    <div className="max-w-[560px] py-10">
      <h1 className="t-title">Not part of your login</h1>
      <p className="mt-2 text-[16px] text-muted">
        Your role does not include this screen. Ask the owner of your company
        account if you need it.
      </p>
      <ButtonLink to="/" className="mt-5" variant="primary">
        Go to your start page
      </ButtonLink>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-full place-items-center px-5 py-16">
      <div className="max-w-[460px]">
        <Link to="/">
          <Brand />
        </Link>
        <p className="t-fig mt-10 text-[64px] text-faint">404</p>
        <h1 className="t-title mt-2">This road does not go anywhere</h1>
        <p className="mt-2 text-[16px] text-muted">
          The page may have moved, or the link was mistyped. Tracking a parcel?
          Use the tracking number from your receipt.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink to="/" variant="primary">
            Go to the start
          </ButtonLink>
          <ButtonLink to="/track">Track a parcel</ButtonLink>
        </div>
      </div>
    </div>
  );
}

const STAFF: Role[] = ["admin", "ops"];

function App() {
  return (
    <Suspense fallback={<Loading rows={6} />}>
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route
          path="/login"
          element={
            <Public>
              <Login />
            </Public>
          }
        />
        <Route path="/signup" element={<Navigate to="/join" replace />} />
        <Route path="/join" element={<Join />} />
        <Route path="/send" element={<Send />} />
        <Route path="/about" element={<About />} />
        <Route path="/features" element={<Features />} />
        <Route path="/truck-owners" element={<TruckOwners />} />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:awb" element={<Track />} />
        <Route
          path="/driver"
          element={
            <Guard roles={["driver"]}>
              <DriverApp />
            </Guard>
          }
        />
        <Route
          path="/partner"
          element={
            <Guard roles={["partner"]}>
              <PartnerApp />
            </Guard>
          }
        />
        <Route
          path="/print/label/:id"
          element={
            <Guard>
              <PrintLabel />
            </Guard>
          }
        />
        <Route
          path="/print/labels"
          element={
            <Guard>
              <PrintLabels />
            </Guard>
          }
        />
        <Route
          path="/print/lr/:id"
          element={
            <Guard>
              <PrintLR />
            </Guard>
          }
        />
        <Route
          path="/print/invoice/:id"
          element={
            <Guard>
              <PrintInvoice />
            </Guard>
          }
        />
        <Route
          element={
            <Guard>
              <Layout />
            </Guard>
          }
        >
          <Route path="/" element={<Home />} />
          <Route
            path="/shipments"
            element={
              <Guard roles={[...STAFF, "customer"]}>
                <Shipments />
              </Guard>
            }
          />
          <Route
            path="/shipments/new"
            element={
              <Guard roles={[...STAFF, "customer"]}>
                <NewShipment />
              </Guard>
            }
          />
          <Route
            path="/shipments/bulk"
            element={
              <Guard roles={[...STAFF, "customer"]}>
                <BulkUpload />
              </Guard>
            }
          />
          <Route
            path="/shipments/:id"
            element={
              <Guard roles={[...STAFF, "customer"]}>
                <ShipmentDetail />
              </Guard>
            }
          />
          <Route
            path="/trips"
            element={
              <Guard roles={STAFF}>
                <Trips />
              </Guard>
            }
          />
          <Route
            path="/trips/:id"
            element={
              <Guard roles={STAFF}>
                <TripDetail />
              </Guard>
            }
          />
          <Route
            path="/routes"
            element={
              <Guard roles={STAFF}>
                <RoutePlanner />
              </Guard>
            }
          />
          <Route
            path="/fleet"
            element={
              <Guard roles={STAFF}>
                <Fleet />
              </Guard>
            }
          />
          <Route
            path="/marketplace"
            element={
              <Guard roles={STAFF}>
                <Marketplace />
              </Guard>
            }
          />
          <Route
            path="/warehouse"
            element={
              <Guard roles={[...STAFF, "warehouse"]}>
                <Warehouse />
              </Guard>
            }
          />
          <Route
            path="/billing"
            element={
              <Guard roles={[...STAFF, "customer"]}>
                <Billing />
              </Guard>
            }
          />
          <Route
            path="/customers"
            element={
              <Guard roles={STAFF}>
                <Customers />
              </Guard>
            }
          />
          <Route
            path="/reports"
            element={
              <Guard roles={STAFF}>
                <Reports />
              </Guard>
            }
          />
          <Route
            path="/team"
            element={
              <Guard roles={["admin"]}>
                <Team />
              </Guard>
            }
          />
          <Route
            path="/messages"
            element={
              <Guard roles={STAFF}>
                <Messages />
              </Guard>
            }
          />
          <Route
            path="/settings"
            element={
              <Guard roles={["admin"]}>
                <SettingsPage />
              </Guard>
            }
          />
          <Route
            path="/requests"
            element={
              <Guard roles={STAFF}>
                <Requests />
              </Guard>
            }
          />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

// The demo build is a single file hosted inside a frame, so it routes in memory.
const Router = DEMO ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ToastHost>
        <Router>
          <App />
        </Router>
      </ToastHost>
    </AuthProvider>
  </StrictMode>,
);

// Installable driver app: register the service worker in real deployments only.
if (!DEMO && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
