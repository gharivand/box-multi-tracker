import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalytics } from "../src/index.js";
import type { EventValidator, ProviderError, ValidationError } from "../src/index.js";
import { createSentryReporter } from "../src/sentry/index.js";
import {
  collectUnhandledRejections,
  recordingProvider,
  rejectingProvider,
  throwingProvider,
} from "./helpers.js";
import type { AppEvents } from "./helpers.js";

// Sentry is mocked at the adapter's import boundary: these tests check what the
// adapter hands to `captureException`, never a real Sentry. The real SDK is
// exercised in sentry.integration.test.ts.
//
// The mock is a plain recording function, not `vi.fn()`: a spy attaches its own
// handlers to returned promises, which would hide the unhandled rejections the
// isolation tests are looking for.
const sentry = vi.hoisted(() => {
  const calls: unknown[][] = [];
  let behavior: () => unknown = () => "event-id";
  return {
    calls,
    behave(next: () => unknown): void {
      behavior = next;
    },
    reset(): void {
      calls.length = 0;
      behavior = () => "event-id";
    },
    captureException(...args: unknown[]): unknown {
      calls.push(args);
      return behavior();
    },
  };
});

vi.mock("@sentry/browser", () => ({ captureException: sentry.captureException }));

/** Distinctive value placed in analytics payloads: it must never reach Sentry. */
const SECRET = "payload-secret-value-4f9c";

beforeEach(() => sentry.reset());

/** Everything handed to Sentry as text, to search for leaked data. */
function everythingSent(): string {
  return JSON.stringify(
    sentry.calls.map(([exception, context]) => [
      exception instanceof Error ? { name: exception.name, message: exception.message } : exception,
      context,
    ]),
  );
}

/** Asserts that Sentry received exactly this call (exception matcher, capture context). */
function expectSentCall(exception: unknown, context: unknown): void {
  expect(sentry.calls).toContainEqual([exception, context]);
}

function sentException(call = 0): unknown {
  return sentry.calls[call]?.[0];
}

const providerError = (error: unknown): ProviderError => ({
  providerName: "mixpanel",
  eventName: "order_created",
  error,
});

/** What the Core reports for a validator that threw: `cause` is always present. */
const validatorException = (cause: unknown): ValidationError => ({
  eventName: "order_created",
  issues: [{ message: "Validator threw an error", path: [] }],
  cause,
});

/** What the Core reports for an ordinary invalid payload: no `cause` property. */
const ordinaryFailure: ValidationError = {
  eventName: "order_created",
  issues: [{ message: "must be positive", path: ["amount"] }],
};

const throwingValidator = (thrown: unknown): EventValidator<AppEvents> => ({
  validate: () => {
    throw thrown;
  },
});

describe("provider errors", () => {
  it("are sent to Sentry as the original Error", () => {
    const failure = new Error("provider failed");
    const reporter = createSentryReporter({ instanceId: "instance-a" });

    reporter.onProviderError(providerError(failure));

    expect(sentry.calls).toHaveLength(1);
    expect(sentException()).toBe(failure);
  });

  it("carry the searchable tags, including the instance id", () => {
    const reporter = createSentryReporter({ instanceId: "instance-a" });

    reporter.onProviderError(providerError(new Error("x")));

    expectSentCall(expect.any(Error), {
      level: "error",
      tags: {
        source: "box-multi-tracker",
        instance: "instance-a",
        error_type: "provider_error",
        provider: "mixpanel",
        event: "order_created",
      },
      contexts: { box_multi_tracker: { thrown_value_was_error: true } },
    });
  });

  it("use each reporter's own instance id", () => {
    createSentryReporter({ instanceId: "a" }).onProviderError(providerError(new Error("x")));
    createSentryReporter({ instanceId: "b" }).onProviderError(providerError(new Error("x")));

    const tags = sentry.calls.map(([, context]) => (context as { tags: Record<string, string> }).tags.instance);
    expect(tags).toEqual(["a", "b"]);
  });

  it.each([
    ["a string", `secret data ${SECRET}`],
    ["an object", { userEmail: SECRET }],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
  ])("replace %s with a fixed message instead of sending it", (_label, thrown) => {
    createSentryReporter({ instanceId: "a" }).onProviderError(providerError(thrown));

    expect(sentException()).toBeInstanceOf(Error);
    expect((sentException() as Error).message).toBe('Analytics provider "mixpanel" failed with a non-Error value');
    expect(sentry.calls[0]?.[1]).toMatchObject({ contexts: { box_multi_tracker: { thrown_value_was_error: false } } });
    expect(everythingSent()).not.toContain(SECRET);
  });
});

describe("validation errors", () => {
  it("do not report an ordinary validation failure", () => {
    createSentryReporter({ instanceId: "a" }).onValidationError(ordinaryFailure);

    expect(sentry.calls).toEqual([]);
  });

  it("report a validator exception with the original Error", () => {
    const boom = new Error("validator crashed");

    createSentryReporter({ instanceId: "instance-a" }).onValidationError(validatorException(boom));

    expect(sentry.calls).toHaveLength(1);
    expect(sentException()).toBe(boom);
    expectSentCall(boom, {
      level: "error",
      tags: {
        source: "box-multi-tracker",
        instance: "instance-a",
        error_type: "validator_exception",
        event: "order_created",
      },
      contexts: {
        box_multi_tracker: { thrown_value_was_error: true, issue_count: 1 },
      },
    });
  });

  it("do not tag a provider for a validator exception", () => {
    createSentryReporter({ instanceId: "a" }).onValidationError(validatorException(new Error("x")));

    const tags = (sentry.calls[0]?.[1] as { tags: Record<string, string> }).tags;
    expect(tags).not.toHaveProperty("provider");
  });

  it.each([
    ["a string", "just a string"],
    ["an object", { code: 7, user: SECRET }],
    ["a number", 42],
  ])("replace a thrown %s with a fixed message", (_label, thrown) => {
    createSentryReporter({ instanceId: "a" }).onValidationError(validatorException(thrown));

    expect((sentException() as Error).message).toBe("Validator threw a non-Error value");
    expect(everythingSent()).not.toContain(SECRET);
  });

  it("classifies by the presence of `cause`, so a thrown `undefined` is still reported", () => {
    createSentryReporter({ instanceId: "a" }).onValidationError(validatorException(undefined));

    expect(sentry.calls).toHaveLength(1);
    expect((sentException() as Error).message).toBe("Validator threw a non-Error value");
  });

  it("sends the number of issues but never their text, which may derive from the thrown value", () => {
    createSentryReporter({ instanceId: "a" }).onValidationError({
      eventName: "order_created",
      issues: [
        { message: `Validator threw: ${SECRET}`, path: [] },
        { message: `bad value ${SECRET}`, path: ["items", 0, "id"] },
      ],
      cause: SECRET,
    });

    expect(sentry.calls[0]?.[1]).toMatchObject({
      contexts: { box_multi_tracker: { thrown_value_was_error: false, issue_count: 2 } },
    });
    expect(everythingSent()).not.toContain(SECRET);
  });
});

describe("with createAnalytics", () => {
  it("reports a synchronous provider failure and still reaches the other providers", () => {
    const after = recordingProvider("after");
    const reporter = createSentryReporter({ instanceId: "instance-a" });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("broken", new Error("sync failure")) }, { provider: after }],
      onError: reporter.onProviderError,
      onValidationError: reporter.onValidationError,
    });

    analytics.track("order_created", { orderId: SECRET, amount: 1 });

    expect(after.events).toHaveLength(1);
    expect(sentry.calls).toHaveLength(1);
    expect(sentry.calls[0]?.[1]).toMatchObject({
      tags: { provider: "broken", event: "order_created", instance: "instance-a", error_type: "provider_error" },
    });
  });

  it("reports an asynchronous provider rejection", async () => {
    const reporter = createSentryReporter({ instanceId: "instance-a" });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: rejectingProvider("slow", new Error("async failure")) }],
      onError: reporter.onProviderError,
    });

    const unhandled = await collectUnhandledRejections(() => analytics.track("logout"));

    expect(unhandled).toEqual([]);
    expect(sentry.calls).toHaveLength(1);
    expect((sentException() as Error).message).toBe("async failure");
    expect(sentry.calls[0]?.[1]).toMatchObject({ tags: { provider: "slow", event: "logout" } });
  });

  it("does not report an ordinary validation failure, and delivers nothing", () => {
    const provider = recordingProvider("p");
    const reporter = createSentryReporter({ instanceId: "a" });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider }],
      validator: {
        validate: () => ({ success: false, issues: [{ message: "must be positive", path: ["amount"] }] }),
      },
      onError: reporter.onProviderError,
      onValidationError: reporter.onValidationError,
    });

    analytics.track("order_created", { orderId: SECRET, amount: -1 });

    expect(provider.events).toEqual([]);
    expect(sentry.calls).toEqual([]);
  });

  it("reports a validator that throws an Error, and delivers nothing", () => {
    const provider = recordingProvider("p");
    const boom = new Error("validator crashed");
    const reporter = createSentryReporter({ instanceId: "instance-a" });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider }],
      validator: throwingValidator(boom),
      onError: reporter.onProviderError,
      onValidationError: reporter.onValidationError,
    });

    analytics.track("order_created", { orderId: SECRET, amount: 1 });

    expect(provider.events).toEqual([]);
    expect(sentry.calls).toHaveLength(1);
    expect(sentException()).toBe(boom);
    expect(sentry.calls[0]?.[1]).toMatchObject({
      tags: { error_type: "validator_exception", event: "order_created", instance: "instance-a" },
    });
  });

  it("reports a validator that throws `undefined`, as the Core marks it with a `cause` property", () => {
    const reporter = createSentryReporter({ instanceId: "a" });
    const analytics = createAnalytics<AppEvents>({
      providers: [],
      validator: throwingValidator(undefined),
      onValidationError: reporter.onValidationError,
    });

    analytics.track("logout");

    expect(sentry.calls).toHaveLength(1);
    expect(sentry.calls[0]?.[1]).toMatchObject({ tags: { error_type: "validator_exception" } });
  });

  it("never sends the analytics payload or the event object", async () => {
    const reporter = createSentryReporter({ instanceId: "a" });
    const sync = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("sync", new Error("sync failure")) }],
      onError: reporter.onProviderError,
    });
    const asynchronous = createAnalytics<AppEvents>({
      providers: [{ provider: rejectingProvider("async", new Error("async failure")) }],
      onError: reporter.onProviderError,
    });
    const validator = createAnalytics<AppEvents>({
      providers: [],
      validator: throwingValidator(new Error("validator crashed")),
      onValidationError: reporter.onValidationError,
    });
    const invalid = createAnalytics<AppEvents>({
      providers: [],
      validator: { validate: () => ({ success: false, issues: [{ message: "invalid", path: ["amount"] }] }) },
      onValidationError: reporter.onValidationError,
    });

    await collectUnhandledRejections(() => {
      for (const analytics of [sync, asynchronous, validator, invalid]) {
        analytics.track("user_registered", { userId: SECRET });
      }
    });

    expect(sentry.calls).toHaveLength(3); // sync, async, validator exception; the invalid one is not reported
    expect(everythingSent()).not.toContain(SECRET);
    expect(everythingSent()).not.toContain("payload");
    expect(everythingSent()).not.toContain("issues");
  });

  it("sends only the documented keys", () => {
    const reporter = createSentryReporter({ instanceId: "a" });
    reporter.onProviderError(providerError(new Error("x")));
    reporter.onValidationError(validatorException(new Error("y")));

    for (const [, context] of sentry.calls) {
      const sent = context as { level: string; tags: object; contexts: Record<string, object> };
      expect(Object.keys(sent).sort()).toEqual(["contexts", "level", "tags"]);
      expect(Object.keys(sent.contexts)).toEqual(["box_multi_tracker"]);
    }
    expect(Object.keys((sentry.calls[0]?.[1] as { tags: object }).tags).sort()).toEqual(
      ["error_type", "event", "instance", "provider", "source"],
    );
    expect(Object.keys((sentry.calls[1]?.[1] as { tags: object }).tags).sort()).toEqual(
      ["error_type", "event", "instance", "source"],
    );
  });
});

describe("isolation from Sentry failures", () => {
  it("does not let a synchronous Sentry exception escape, and does not report it again", () => {
    sentry.behave(() => {
      throw new Error("sentry is broken");
    });
    const after = recordingProvider("after");
    const reporter = createSentryReporter({ instanceId: "a" });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("broken", new Error("x")) }, { provider: after }],
      onError: reporter.onProviderError,
    });

    expect(() => analytics.track("logout")).not.toThrow();
    expect(() => reporter.onValidationError(validatorException(new Error("y")))).not.toThrow();

    expect(after.events).toHaveLength(1);
    // One attempt per report: Sentry's own failure is not fed back into Sentry.
    expect(sentry.calls).toHaveLength(2);
  });

  it("does not create an unhandled rejection when Sentry returns a rejected promise", async () => {
    sentry.behave(() => Promise.reject(new Error("sentry async failure")));
    const reporter = createSentryReporter({ instanceId: "a" });

    const unhandled = await collectUnhandledRejections(() => {
      reporter.onProviderError(providerError(new Error("x")));
      reporter.onValidationError(validatorException(new Error("y")));
    });

    expect(unhandled).toEqual([]);
    expect(sentry.calls).toHaveLength(2);
  });

  it("does not let a misbehaving thenable from Sentry escape", async () => {
    sentry.behave(() => ({
      get then(): never {
        throw new Error("then getter failed");
      },
    }));
    const reporter = createSentryReporter({ instanceId: "a" });

    const unhandled = await collectUnhandledRejections(() => {
      expect(() => reporter.onProviderError(providerError(new Error("x")))).not.toThrow();
    });

    expect(unhandled).toEqual([]);
  });

  it("survives a thrown value that throws when inspected", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("trap");
        },
      },
    );
    const reporter = createSentryReporter({ instanceId: "a" });

    expect(() => reporter.onProviderError(providerError(hostile))).not.toThrow();
    expect(() => reporter.onValidationError(validatorException(hostile))).not.toThrow();
  });

  it("survives malformed arguments from a caller that bypasses the types", () => {
    const reporter = createSentryReporter({ instanceId: "a" });

    expect(() => reporter.onProviderError(undefined as unknown as ProviderError)).not.toThrow();
    expect(() => reporter.onValidationError(null as unknown as ValidationError)).not.toThrow();
    expect(() =>
      reporter.onValidationError({ eventName: "x", cause: new Error("y") } as unknown as ValidationError),
    ).not.toThrow();
  });
});

describe("handlers", () => {
  it("work when destructured (no `this`)", () => {
    const { onProviderError, onValidationError } = createSentryReporter({ instanceId: "a" });

    onProviderError(providerError(new Error("x")));
    onValidationError(validatorException(new Error("y")));

    expect(sentry.calls).toHaveLength(2);
  });

  it("do not interfere with each other across reporters", () => {
    const a = createSentryReporter({ instanceId: "a" });
    const b = createSentryReporter({ instanceId: "b" });

    a.onValidationError(ordinaryFailure);
    b.onProviderError(providerError(new Error("x")));

    expect(sentry.calls).toHaveLength(1);
    expect(sentry.calls[0]?.[1]).toMatchObject({ tags: { instance: "b" } });
  });
});
