import { createAppAnalytics } from "../../analytics/analytics";
import type { AppAnalytics } from "../../analytics/analytics";
import { createDispatchLog } from "../../analytics/dispatch-log";
import type { DispatchLog } from "../../analytics/dispatch-log";
import { createAppDebugLogger } from "../../monitoring/debug-logger";
import type { SentryCaptureLog } from "../../monitoring/sentry-capture-log";
import { createSentryReporter } from "box-multi-tracker/sentry";

export interface Playground {
  readonly log: DispatchLog;
  /** What Sentry was asked to send (it is initialized by the application, in `main.tsx`). */
  readonly sentryLog: SentryCaptureLog;
  /** Two independent analytics instances, each with its own providers and state. */
  readonly instances: readonly AppAnalytics[];
}

/**
 * Builds the playground's two instances. They share nothing but the log that
 * visualizes them, and are configured differently on purpose: another provider
 * order, and a provider that starts disabled.
 */
export function createPlayground(sentryLog: SentryCaptureLog): Playground {
  const log = createDispatchLog();
  // One logger for both instances: it is stateless, and the event log tells them apart.
  const debugLogger = createAppDebugLogger();

  return {
    log,
    sentryLog,
    instances: [
      createAppAnalytics({
        instanceId: "a",
        label: "Instance A",
        log,
        // One Sentry reporter per instance, so Sentry events carry the right `instance` tag.
        monitoring: [debugLogger, createSentryReporter({ instanceId: "a" })],
        providers: [
          { kind: "console", enabled: true },
          { kind: "flaky-service", enabled: true },
          { kind: "mock-analytics", enabled: true },
        ],
      }),
      createAppAnalytics({
        instanceId: "b",
        label: "Instance B",
        log,
        monitoring: [debugLogger, createSentryReporter({ instanceId: "b" })],
        providers: [
          { kind: "mock-analytics", enabled: true },
          { kind: "console", enabled: false },
          { kind: "flaky-service", enabled: true },
        ],
      }),
    ],
  };
}
