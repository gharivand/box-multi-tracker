import { createAnalytics } from "box-multi-tracker";
import type {
  AnalyticsInstance,
  AnalyticsProvider,
  ProviderEntry,
  ProviderError,
  ValidationError,
} from "box-multi-tracker";
import type { DispatchLog } from "./dispatch-log";
import type { AppEventInputs, AppEvents } from "./events";
import { observeProvider } from "./observed-provider";
import { createConsoleProvider } from "./providers/console.provider";
import { createFailureControl, createFlakyProvider } from "./providers/flaky.provider";
import type { FailureControl } from "./providers/flaky.provider";
import { createMockAnalyticsProvider } from "./providers/mock-analytics.provider";
import { appEventValidator } from "./schemas";
import { createTracking } from "./tracking";
import type { Tracking } from "./tracking";
import { createValidatorFault, withValidatorFault } from "./validator-fault";
import type { ValidatorFault } from "./validator-fault";

export type ProviderKind = "console" | "mock-analytics" | "flaky-service";

/** Which providers an instance registers (in order) and whether each starts enabled. */
export interface ProviderSetup {
  kind: ProviderKind;
  enabled: boolean;
}

/**
 * Where an instance reports its failures besides the event log. Structurally the
 * handlers of `createSentryReporter` and `createDebugLogger`, but this layer knows
 * about neither.
 */
export interface MonitoringHandlers {
  onProviderError(error: ProviderError): void;
  onValidationError(error: ValidationError): void;
}

export interface AppAnalyticsOptions {
  instanceId: string;
  label: string;
  providers: readonly ProviderSetup[];
  log: DispatchLog;
  /**
   * Optional reporters (the debug logger, the Sentry reporter, ...), connected to the SDK's
   * error callbacks and called in order. They never throw, so one cannot starve the next.
   */
  monitoring?: readonly MonitoringHandlers[];
}

/** Everything the playground needs from one configured analytics instance. */
export interface AppAnalytics {
  readonly instanceId: string;
  readonly label: string;
  /** Provider names, in registration order. */
  readonly providerNames: readonly string[];
  /** Only the provider-management part of the SDK API is exposed. */
  readonly analytics: Pick<AnalyticsInstance<AppEvents, AppEventInputs>, "enableProvider" | "disableProvider" | "isProviderEnabled">;
  readonly tracking: Tracking;
  readonly failure: FailureControl;
  readonly validatorFault: ValidatorFault;
}

/**
 * Composition root for one analytics instance: creates the providers, registers
 * them with the SDK, and wires the application-level `Tracking` on top.
 * Calling it twice yields two fully independent instances.
 */
export function createAppAnalytics(options: AppAnalyticsOptions): AppAnalytics {
  const { instanceId, label, log } = options;
  const failure = createFailureControl();
  const validatorFault = createValidatorFault();
  const monitoring = options.monitoring ?? [];

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

  const analytics = createAnalytics<AppEvents, AppEventInputs>({
    providers,
    // Every event is validated, and possibly transformed, before any provider sees it.
    validator: withValidatorFault(appEventValidator, validatorFault),
    // Provider failures and validation failures arrive through separate callbacks.
    // Each goes to the event log and then to every configured reporter.
    onError: (error) => {
      log.reportError(instanceId, error);
      for (const reporter of monitoring) reporter.onProviderError(error);
    },
    onValidationError: (error) => {
      log.reportValidationError(instanceId, error);
      for (const reporter of monitoring) reporter.onValidationError(error);
    },
  });

  const providerNames = providers.map((entry) => entry.provider.name);

  const tracking = createTracking(analytics, (eventName, payload, send) => {
    // Providers disabled right now are skipped by this very `track` call.
    const skipped = providerNames.filter((name) => !analytics.isProviderEnabled(name));
    log.runDispatch(instanceId, eventName, payload, skipped, send);
  });

  return { instanceId, label, providerNames, analytics, tracking, failure, validatorFault };
}
