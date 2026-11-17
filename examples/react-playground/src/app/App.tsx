import { EventLog } from "../components/EventLog";
import { ProviderControls } from "../components/ProviderControls";
import { SentryCaptures } from "../components/SentryCaptures";
import { CompleteOrder } from "../features/checkout/complete-order";
import { Login } from "../features/auth/login";
import { ProductDetails } from "../features/products/product-details";
import { SentryDemo } from "../features/monitoring/sentry-demo";
import { ValidationDemo } from "../features/validation/validation-demo";
import type { SentryCaptureLog } from "../monitoring/sentry-capture-log";
import { PlaygroundProvider } from "./providers/PlaygroundProvider";
import { usePlayground } from "./providers/playground.context";

function Playground() {
  const { instances, activeInstance, selectInstance } = usePlayground();

  return (
    <div className="page">
      <header className="page-header">
        <h1>box-multi-tracker playground</h1>
        <p>
          Two independent analytics instances, each with its own providers. Feature actions track events through the
          application&apos;s tracking layer into the selected instance; the log shows what each provider received.
        </p>
      </header>

      <main className="layout">
        <div className="column">
          <h2 className="section-title">Providers</h2>
          {instances.map((instance) => (
            <ProviderControls
              key={instance.instanceId}
              instance={instance}
              isActive={instance.instanceId === activeInstance.instanceId}
              onSelect={() => selectInstance(instance.instanceId)}
            />
          ))}

          <h2 className="section-title">Simulate</h2>
          <Login />
          <ProductDetails />
          <CompleteOrder />
          <ValidationDemo />
          <SentryDemo />
        </div>

        <div className="column">
          <EventLog />
          <SentryCaptures />
        </div>
      </main>
    </div>
  );
}

export function App({ sentryLog }: { sentryLog: SentryCaptureLog }) {
  return (
    <PlaygroundProvider sentryLog={sentryLog}>
      <Playground />
    </PlaygroundProvider>
  );
}
