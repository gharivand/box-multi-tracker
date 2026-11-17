import * as Sentry from "@sentry/browser";
import { createSentryReporter } from "box-multi-tracker/sentry";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppAnalytics } from "../analytics/analytics";
import type { AppAnalytics } from "../analytics/analytics";
import { createDispatchLog } from "../analytics/dispatch-log";
import { SCENARIOS, PRIVATE_USER_ID } from "../features/monitoring/sentry-demo/sentry-demo.scenarios";
import type { SentryScenario } from "../features/monitoring/sentry-demo/sentry-demo.types";
import { initSentry } from "./sentry";
import { createSentryCaptureLog, eventContains } from "./sentry-capture-log";

// The real Sentry client, initialized the way the app does it, with the app's
// in-memory transport. The scenarios are the ones the Sentry card runs.

const sentryLog = createSentryCaptureLog();

function createInstance(instanceId: string): AppAnalytics {
  return createAppAnalytics({
    instanceId,
    label: `Instance ${instanceId}`,
    log: createDispatchLog(),
    monitoring: createSentryReporter({ instanceId }),
    providers: [
      { kind: "console", enabled: true },
      { kind: "flaky-service", enabled: true },
      { kind: "mock-analytics", enabled: true },
    ],
  });
}

function scenario(id: string): SentryScenario {
  const found = SCENARIOS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Unknown scenario: ${id}`);
  return found;
}

async function runScenario(app: AppAnalytics, id: string): Promise<void> {
  scenario(id).run({ tracking: app.tracking, failure: app.failure, validatorFault: app.validatorFault });
  await Sentry.flush();
}

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  initSentry(sentryLog);
});

beforeEach(() => sentryLog.clear());

afterAll(async () => {
  await Sentry.close();
});

describe("Sentry in the playground", () => {
  it("reports a provider error, tagged with the provider, event and instance", async () => {
    await runScenario(createInstance("a"), "provider-error");

    const events = sentryLog.getSnapshot();
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe('Simulated synchronous failure while sending "order_completed"');
    expect(events[0]?.tags).toMatchObject({
      source: "box-multi-tracker",
      provider: "flaky-service",
      event: "order_completed",
      instance: "a",
      error_type: "provider_error",
    });
  });

  it("reports a validator exception, without a provider tag", async () => {
    await runScenario(createInstance("a"), "validator-exception");

    const events = sentryLog.getSnapshot();
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe('Simulated validator crash while validating "product_viewed"');
    expect(events[0]?.tags).toMatchObject({
      source: "box-multi-tracker",
      event: "product_viewed",
      instance: "a",
      error_type: "validator_exception",
    });
    expect(events[0]?.tags).not.toHaveProperty("provider");
  });

  it("does not report an ordinary validation failure", async () => {
    const app = createInstance("a");

    await runScenario(app, "ordinary-validation-failure");

    expect(sentryLog.getSnapshot()).toEqual([]);
  });

  it("never sends the tracked payload", async () => {
    const app = createInstance("a");

    await runScenario(app, "payload-privacy");

    const events = sentryLog.getSnapshot();
    expect(events).toHaveLength(1);
    expect(events[0]?.tags.error_type).toBe("provider_error");
    expect(events.some((event) => eventContains(event, PRIVATE_USER_ID))).toBe(false);
    expect(events.some((event) => eventContains(event, "ada.private"))).toBe(false);
  });

  it("does not attach console output as breadcrumbs, although the console provider prints payloads", async () => {
    const app = createInstance("a");

    await runScenario(app, "payload-privacy");

    const [event] = sentryLog.getSnapshot();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(PRIVATE_USER_ID)); // it was printed...
    expect(event?.serialized).not.toContain("breadcrumbs"); // ...but is not part of the Sentry event
  });

  it("restores the flaky provider and the validator after a scenario", async () => {
    const app = createInstance("a");

    await runScenario(app, "provider-error");
    await runScenario(app, "validator-exception");

    expect(app.failure.getMode()).toBe("none");
    expect(app.validatorFault.isArmed()).toBe(false);
  });

  it("keeps instances apart through the instance tag", async () => {
    await runScenario(createInstance("a"), "provider-error");
    await runScenario(createInstance("b"), "provider-error");

    expect(sentryLog.getSnapshot().map((event) => event.tags.instance)).toEqual(["a", "b"]);
  });

  it("keeps the other providers working when a provider fails", async () => {
    const app = createInstance("a");
    const log = createDispatchLog();
    const instance = createAppAnalytics({
      instanceId: "c",
      label: "Instance c",
      log,
      monitoring: createSentryReporter({ instanceId: "c" }),
      providers: [
        { kind: "flaky-service", enabled: true },
        { kind: "console", enabled: true },
      ],
    });

    await runScenario(instance, "provider-error");

    const [entry] = log.getSnapshot();
    expect(entry?.deliveries.map((delivery) => [delivery.providerName, delivery.status])).toEqual([
      ["flaky-service", "error"],
      ["console", "ok"],
    ]);
    expect(app.failure.getMode()).toBe("none");
  });
});
