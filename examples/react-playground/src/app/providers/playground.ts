import { createAppAnalytics } from "../../analytics/analytics";
import type { AppAnalytics } from "../../analytics/analytics";
import { createDispatchLog } from "../../analytics/dispatch-log";
import type { DispatchLog } from "../../analytics/dispatch-log";

export interface Playground {
  readonly log: DispatchLog;
  /** Two independent analytics instances, each with its own providers and state. */
  readonly instances: readonly AppAnalytics[];
}

/**
 * Builds the playground's two instances. They share nothing but the log that
 * visualizes them, and are configured differently on purpose: another provider
 * order, and a provider that starts disabled.
 */
export function createPlayground(): Playground {
  const log = createDispatchLog();

  return {
    log,
    instances: [
      createAppAnalytics({
        instanceId: "a",
        label: "Instance A",
        log,
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
        providers: [
          { kind: "mock-analytics", enabled: true },
          { kind: "console", enabled: false },
          { kind: "flaky-service", enabled: true },
        ],
      }),
    ],
  };
}
