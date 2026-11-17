import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { Header } from "../components/Header";
import { ShopProvider } from "./providers/ShopProvider";
import { RouteView } from "./routes";

export function App() {
  return (
    <ShopProvider>
      <div className="shell">
        <Header />
        <div className="layout">
          <main className="main">
            <RouteView />
          </main>
          <AnalyticsPanel />
        </div>
      </div>
    </ShopProvider>
  );
}
