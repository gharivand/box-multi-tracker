import * as Sentry from "@sentry/browser";
import { createSentryReporter } from "box-multi-tracker/sentry";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { createAppAnalytics } from "../analytics/analytics";
import type { AppAnalytics } from "../analytics/analytics";
import { createDispatchLog } from "../analytics/dispatch-log";
import { PRIVATE_USER_ID, SCENARIOS } from "../features/monitoring/sentry-demo/sentry-demo.scenarios";
import { createAppDebugLogger } from "./debug-logger";
import { initSentry } from "./sentry";
import { createSentryCaptureLog } from "./sentry-capture-log";

// The debug logger and the Sentry reporter side by side, wired the way the
// playground wires them (a list of reporters on one instance).

const sentryLog = createSentryCaptureLog();
const spies = {} as Record<"error" | "warn" | "debug", MockInstance>;

function createInstance(debugEnabled: boolean): AppAnalytics {
  return createAppAnalytics({
    instanceId: "a",
    label: "Instance A",
    log: createDispatchLog(),
    monitoring: [createAppDebugLogger(debugEnabled), createSentryReporter({ instanceId: "a" })],
    providers: [
      { kind: "console", enabled: true },
      { kind: "flaky-service", enabled: true },
    ],
  });
}

async function runScenario(app: AppAnalytics, id: string): Promise<void> {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (scenario === undefined) throw new Error(`Unknown scenario: ${id}`);
  scenario.run({ tracking: app.tracking, failure: app.failure, validatorFault: app.validatorFault });
  await Sentry.flush();
}

const logged = (): string => JSON.stringify(Object.values(spies).map((spy) => spy.mock.calls));

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  initSentry(sentryLog);
});

beforeEach(() => {
  sentryLog.clear();
  for (const method of ["error", "warn", "debug"] as const) {
    spies[method] = vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterAll(async () => {
  vi.restoreAllMocks();
  await Sentry.close();
});

describe("debug logger and Sentry together", () => {
  it("logs an ordinary validation failure as a warning, and Sentry gets nothing", async () => {
    await runScenario(createInstance(true), "ordinary-validation-failure");

    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(String(spies.warn.mock.calls[0]?.[0])).toBe('[box-multi-tracker] Validation failed for "order_completed" (2 issues)');
    expect(spies.error).not.toHaveBeenCalled();
    expect(sentryLog.getSnapshot()).toEqual([]);
  });

  it("logs a provider error as an error, and Sentry reports it", async () => {
    await runScenario(createInstance(true), "provider-error");

    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(String(spies.error.mock.calls[0]?.[0])).toContain('Provider "flaky-service" failed while tracking "order_completed"');
    expect(sentryLog.getSnapshot().map((event) => event.tags.error_type)).toEqual(["provider_error"]);
  });

  it("logs a validator exception as an error, and Sentry reports it", async () => {
    await runScenario(createInstance(true), "validator-exception");

    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(String(spies.error.mock.calls[0]?.[0])).toContain('Validator threw while validating "product_viewed"');
    expect(sentryLog.getSnapshot().map((event) => event.tags.error_type)).toEqual(["validator_exception"]);
  });

  it("is silent when disabled (as in a production build), while Sentry behaves the same", async () => {
    const app = createInstance(false);

    await runScenario(app, "provider-error");
    await runScenario(app, "validator-exception");
    await runScenario(app, "ordinary-validation-failure");

    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
    expect(sentryLog.getSnapshot().map((event) => event.tags.error_type)).toEqual(["provider_error", "validator_exception"]);
  });

  it("never logs the tracked payload", async () => {
    await runScenario(createInstance(true), "payload-privacy");

    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(logged()).not.toContain(PRIVATE_USER_ID);
    expect(logged()).not.toContain("ada.private");
  });

  it("keeps Sentry reporting when the console is broken", async () => {
    for (const spy of Object.values(spies)) {
      spy.mockImplementation(() => {
        throw new Error("console is broken");
      });
    }

    await runScenario(createInstance(true), "provider-error");

    expect(sentryLog.getSnapshot()).toHaveLength(1);
  });
});
