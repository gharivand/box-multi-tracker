import * as Sentry from "@sentry/browser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAnalytics } from "../src/index.js";
import { createSentryReporter } from "../src/sentry/index.js";
import { recordingProvider, rejectingProvider, throwingProvider } from "./helpers.js";
import type { AppEvents } from "./helpers.js";

// The real Sentry SDK, initialized by the test (as an application would), with
// a transport that keeps envelopes in memory. Nothing touches the network: this
// shows exactly what the adapter makes Sentry send.

const SECRET = "payload-secret-value-4f9c";

/** The part of an envelope these tests read: items are `[header, payload]` pairs. */
type RecordedEnvelope = readonly [unknown, ReadonlyArray<readonly [{ readonly type?: string }, unknown]>];

let envelopes: RecordedEnvelope[] = [];

interface SentEvent {
  exception?: { values?: Array<{ type?: string; value?: string }> };
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
  level?: string;
}

function sentEvents(): SentEvent[] {
  return envelopes.flatMap(([, items]) =>
    items.flatMap(([header, payload]) => (header.type === "event" ? [payload as SentEvent] : [])),
  );
}

beforeAll(() => {
  Sentry.init({
    dsn: "https://public@sentry.invalid/1",
    defaultIntegrations: false,
    integrations: [],
    transport: () => ({
      send: (envelope) => {
        envelopes.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    }),
  });
});

beforeEach(() => {
  envelopes = [];
});

afterAll(async () => {
  await Sentry.close();
});

function setup(options: { instanceId?: string; validator?: "throws" | "invalid" } = {}) {
  const reporter = createSentryReporter({ instanceId: options.instanceId ?? "instance-a" });
  return createAnalytics<AppEvents>({
    providers: [
      { provider: throwingProvider("sync-provider", new Error("sync provider failure")) },
      { provider: rejectingProvider("async-provider", new Error("async provider rejection")) },
      { provider: recordingProvider("healthy") },
    ],
    validator:
      options.validator === "throws"
        ? {
            validate: () => {
              throw new Error("validator crashed");
            },
          }
        : options.validator === "invalid"
          ? { validate: () => ({ success: false, issues: [{ message: "invalid", path: ["userId"] }] }) }
          : undefined,
    onError: reporter.onProviderError,
    onValidationError: reporter.onValidationError,
  });
}

describe("with the real Sentry SDK", () => {
  it("sends sync and async provider errors with tags and context", async () => {
    setup().track("order_created", { orderId: SECRET, amount: 1 });
    await Sentry.flush();

    const events = sentEvents();
    expect(events).toHaveLength(2);

    const sync = events.find((event) => event.tags?.provider === "sync-provider");
    expect(sync?.exception?.values?.[0]?.value).toBe("sync provider failure");
    expect(sync?.level).toBe("error");
    expect(sync?.tags).toMatchObject({
      source: "box-multi-tracker",
      provider: "sync-provider",
      event: "order_created",
      instance: "instance-a",
      error_type: "provider_error",
    });
    expect(sync?.contexts?.box_multi_tracker).toEqual({ thrown_value_was_error: true });

    const asynchronous = events.find((event) => event.tags?.provider === "async-provider");
    expect(asynchronous?.exception?.values?.[0]?.value).toBe("async provider rejection");
    expect(asynchronous?.tags?.error_type).toBe("provider_error");
  });

  it("sends a validator exception, with the issue count, and no provider tag", async () => {
    setup({ validator: "throws" }).track("user_registered", { userId: SECRET });
    await Sentry.flush();

    const events = sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.value).toBe("validator crashed");
    expect(events[0]?.tags).toMatchObject({
      source: "box-multi-tracker",
      event: "user_registered",
      instance: "instance-a",
      error_type: "validator_exception",
    });
    expect(events[0]?.tags).not.toHaveProperty("provider");
    expect(events[0]?.contexts?.box_multi_tracker).toEqual({ thrown_value_was_error: true, issue_count: 1 });
  });

  it("sends nothing for an ordinary validation failure", async () => {
    setup({ validator: "invalid" }).track("user_registered", { userId: SECRET });
    await Sentry.flush();

    expect(sentEvents()).toEqual([]);
    expect(envelopes).toEqual([]);
  });

  it("never sends the analytics payload anywhere in the envelopes", async () => {
    setup().track("order_created", { orderId: SECRET, amount: 1 });
    setup({ validator: "throws" }).track("user_registered", { userId: SECRET });
    setup({ validator: "invalid" }).track("user_registered", { userId: SECRET });
    await Sentry.flush();

    expect(sentEvents().length).toBeGreaterThan(0);
    expect(JSON.stringify(envelopes)).not.toContain(SECRET);
  });

  it("keeps instances apart by their instance tag", async () => {
    setup({ instanceId: "instance-a" }).track("logout");
    setup({ instanceId: "instance-b" }).track("logout");
    await Sentry.flush();

    const instances = sentEvents().map((event) => event.tags?.instance);
    expect(instances.filter((id) => id === "instance-a")).toHaveLength(2);
    expect(instances.filter((id) => id === "instance-b")).toHaveLength(2);
  });
});
