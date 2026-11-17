import { createAnalytics } from "box-multi-tracker";
import type { AnalyticsInstance, AnalyticsProvider, ProviderEntry } from "box-multi-tracker";
import type { DispatchLog } from "./dispatch-log";
import type { AppEvents } from "./events";
import { observeProvider } from "./observed-provider";
import { createConsoleProvider } from "./providers/console.provider";
import { createFailureControl, createFlakyProvider } from "./providers/flaky.provider";
import type { FailureControl } from "./providers/flaky.provider";
import { createMockAnalyticsProvider } from "./providers/mock-analytics.provider";
import { createTracking } from "./tracking";
import type { Tracking } from "./tracking";

export type ProviderKind = "console" | "mock-analytics" | "flaky-service";

/** Which providers an instance registers (in order) and whether each starts enabled. */
export interface ProviderSetup {
  kind: ProviderKind;
  enabled: boolean;
}

export interface AppAnalyticsOptions {
  instanceId: string;
  label: string;
  providers: readonly ProviderSetup[];
  log: DispatchLog;
}

/** Everything the playground needs from one configured analytics instance. */
export interface AppAnalytics {
  readonly instanceId: string;
  readonly label: string;
  /** Provider names, in registration order. */
  readonly providerNames: readonly string[];
  /** Only the provider-management part of the SDK API is exposed. */
  readonly analytics: Pick<AnalyticsInstance<AppEvents>, "enableProvider" | "disableProvider" | "isProviderEnabled">;
  readonly tracking: Tracking;
  readonly failure: FailureControl;
}

/**
 * Composition root for one analytics instance: creates the providers, registers
 * them with the SDK, and wires the application-level `Tracking` on top.
 * Calling it twice yields two fully independent instances.
 */
export function createAppAnalytics(options: AppAnalyticsOptions): AppAnalytics {
  const { instanceId, label, log } = options;
  const failure = createFailureControl();

  const recorder = { start: (providerName: string, event: { name: string; payload: unknown }) =>
    log.recordDelivery(instanceId, providerName, event) };

  const createProvider = (kind: ProviderKind): AnalyticsProvider<AppEvents> => {
    switch (kind) {
      case "console":
        return createConsoleProvider({ write: (line) => console.info(`[${label}] ${line}`) });
      case "mock-analytics":
        return createMockAnalyticsProvider();
      case "flaky-service":
        return createFlakyProvider(failure);
    }
  };

  const providers: ProviderEntry<AppEvents>[] = options.providers.map(({ kind, enabled }) => ({
    provider: observeProvider(createProvider(kind), recorder),
    enabled,
  }));

  const analytics = createAnalytics<AppEvents>({
    providers,
    onError: (error) => log.reportError(instanceId, error),
  });

  const providerNames = providers.map((entry) => entry.provider.name);

  const tracking = createTracking(analytics, (eventName, payload, send) => {
    // Providers disabled right now are skipped by this very `track` call.
    const skipped = providerNames.filter((name) => !analytics.isProviderEnabled(name));
    log.runDispatch(instanceId, eventName, payload, skipped, send);
  });

  return { instanceId, label, providerNames, analytics, tracking, failure };
}
