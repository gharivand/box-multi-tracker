import { describe, expect, it, vi } from "vitest";
import { createAnalytics } from "../src/index.js";
import type { EventValidator, ProviderError, ValidationError, ValidationResult } from "../src/index.js";
import {
  collectUnhandledRejections,
  nextTurn,
  recordingProvider,
  rejectingProvider,
  throwingProvider,
} from "./helpers.js";
import type { AppEvents } from "./helpers.js";

// These tests use a hand-written validator, never Zod: the Core's contract must
// stand on its own.

/** What callers pass to `track`: `amount` may arrive as text. */
interface Inputs {
  user_registered: { userId: string };
  order_created: { orderId: string; amount: number | string };
  logout: undefined;
}

function fail(path: string, message: string): ValidationResult<never> {
  return { success: false, issues: [{ message, path: [path] }] };
}

type Rules = { [K in keyof AppEvents]: (payload: Inputs[K]) => ValidationResult<AppEvents[K]> };

const rules: Rules = {
  user_registered: (payload) =>
    payload.userId === "" ? fail("userId", "must not be empty") : { success: true, data: { userId: payload.userId } },
  order_created: (payload) => {
    const amount = Number(payload.amount);
    return Number.isNaN(amount)
      ? fail("amount", "must be numeric")
      : { success: true, data: { orderId: payload.orderId, amount } };
  },
  logout: () => ({ success: true, data: undefined }),
};

/** Builds a validator from one rule per event; optionally logs each call. */
function validatorFrom(eventRules: Rules, log?: string[]): EventValidator<Inputs, AppEvents> {
  return {
    validate: (name, payload) => {
      log?.push(`validate:${name}`);
      return eventRules[name](payload);
    },
  };
}

/** Converts `amount` text to a number and rejects empty ids; optionally logs each call. */
function createTestValidator(log?: string[]): EventValidator<Inputs, AppEvents> {
  return validatorFrom(rules, log);
}

describe("without a validator", () => {
  it("dispatches the exact payload object, unchanged", () => {
    const provider = recordingProvider("p");
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider }], onValidationError });
    const payload = { orderId: "A-1", amount: 5 };

    analytics.track("order_created", payload);

    expect(provider.events).toEqual([{ name: "order_created", payload }]);
    expect(provider.events[0]?.payload).toBe(payload);
    expect(onValidationError).not.toHaveBeenCalled();
  });

  it("never reports a validation error, even for payloads a validator would reject", () => {
    const provider = recordingProvider("p");
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider }], onValidationError });

    analytics.track("user_registered", { userId: "" });

    expect(provider.events).toHaveLength(1);
    expect(onValidationError).not.toHaveBeenCalled();
  });
});

describe("successful validation", () => {
  it("dispatches the validated, transformed payload", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: createTestValidator(),
    });

    analytics.track("order_created", { orderId: "123", amount: "500" });

    expect(provider.events).toEqual([{ name: "order_created", payload: { orderId: "123", amount: 500 } }]);
  });

  it("gives every provider the same transformed event, in registration order", () => {
    const log: string[] = [];
    const first = recordingProvider("first", log);
    const second = recordingProvider("second", log);
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: first }, { provider: second }],
      validator: createTestValidator(),
    });

    analytics.track("order_created", { orderId: "123", amount: "500" });

    expect(log).toEqual(["first", "second"]);
    expect(first.events[0]).toBe(second.events[0]);
    expect(first.events[0]?.payload).toEqual({ orderId: "123", amount: 500 });
  });

  it("runs the validator exactly once per track call, before any provider", () => {
    const log: string[] = [];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: recordingProvider("a", log) }, { provider: recordingProvider("b", log) }],
      validator: createTestValidator(log),
    });

    analytics.track("user_registered", { userId: "u1" });

    expect(log).toEqual(["validate:user_registered", "a", "b"]);
  });

  it("passes the event name and the original input payload to the validator", () => {
    const validate = vi.fn((name: keyof AppEvents, payload: unknown): ValidationResult<never> => {
      void name;
      void payload;
      return fail("x", "no");
    });
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: { validate: validate as EventValidator<Inputs, AppEvents>["validate"] },
    });
    const payload = { orderId: "1", amount: "2" };

    analytics.track("order_created", payload);

    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]?.[0]).toBe("order_created");
    expect(validate.mock.calls[0]?.[1]).toBe(payload);
  });

  it("validates payloadless events with an undefined payload", () => {
    const provider = recordingProvider("p");
    const validate = vi.fn(rules.logout);
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: validatorFrom({ ...rules, logout: validate }),
    });

    analytics.track("logout");

    expect(validate).toHaveBeenCalledWith(undefined);
    expect(provider.events).toEqual([{ name: "logout", payload: undefined }]);
  });

  it("does not report anything to onValidationError", () => {
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: recordingProvider("p") }],
      validator: createTestValidator(),
      onValidationError,
    });

    analytics.track("user_registered", { userId: "u1" });

    expect(onValidationError).not.toHaveBeenCalled();
  });

  it("still respects enabled flags", () => {
    const enabled = recordingProvider("enabled");
    const disabled = recordingProvider("disabled");
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: enabled }, { provider: disabled, enabled: false }],
      validator: createTestValidator(),
    });

    analytics.track("user_registered", { userId: "u1" });

    expect(enabled.events).toHaveLength(1);
    expect(disabled.events).toHaveLength(0);
  });

  it("returns undefined", () => {
    const analytics = createAnalytics<AppEvents, Inputs>({ providers: [], validator: createTestValidator() });
    expect(analytics.track("logout")).toBeUndefined();
  });
});

describe("failed validation", () => {
  it("dispatches to no provider, enabled or not", () => {
    const providers = [recordingProvider("a"), recordingProvider("b"), recordingProvider("c")];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: providers[0]! }, { provider: providers[1]! }, { provider: providers[2]!, enabled: false }],
      validator: createTestValidator(),
    });

    analytics.track("user_registered", { userId: "" });
    analytics.track("order_created", { orderId: "1", amount: "not a number" });

    for (const provider of providers) {
      expect(provider.events).toEqual([]);
    }
  });

  it("reports the event name and the issues to onValidationError", () => {
    const reported: ValidationError[] = [];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [recordingProvider("p")].map((provider) => ({ provider })),
      validator: createTestValidator(),
      onValidationError: (error) => reported.push(error),
    });

    analytics.track("order_created", { orderId: "1", amount: "abc" });

    expect(reported).toEqual([
      { eventName: "order_created", issues: [{ message: "must be numeric", path: ["amount"] }] },
    ]);
  });

  it("reports synchronously, before track returns", () => {
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: createTestValidator(),
      onValidationError,
    });

    analytics.track("user_registered", { userId: "" });

    expect(onValidationError).toHaveBeenCalledTimes(1);
  });

  it("never includes the payload in the reported error", () => {
    const reported: ValidationError[] = [];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: createTestValidator(),
      onValidationError: (error) => reported.push(error),
    });

    analytics.track("order_created", { orderId: "secret-order", amount: "abc" });

    expect(Object.keys(reported[0] ?? {}).sort()).toEqual(["eventName", "issues"]);
    expect(JSON.stringify(reported)).not.toContain("secret-order");
  });

  it("is not reported as a provider error, and provider errors are not reported as validation errors", () => {
    const onError = vi.fn();
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: throwingProvider("bad", new Error("provider failed")) }],
      validator: createTestValidator(),
      onError,
      onValidationError,
    });

    analytics.track("user_registered", { userId: "" }); // validation fails
    expect(onError).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenCalledTimes(1);

    analytics.track("user_registered", { userId: "u1" }); // provider fails
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onValidationError).toHaveBeenCalledTimes(1);
  });

  it("keeps working after a failure: later valid events are dispatched", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: createTestValidator(),
    });

    analytics.track("user_registered", { userId: "" });
    analytics.track("user_registered", { userId: "u1" });

    expect(provider.events).toEqual([{ name: "user_registered", payload: { userId: "u1" } }]);
  });

  it("is silently dropped when no onValidationError is configured", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: createTestValidator(),
    });

    expect(() => analytics.track("user_registered", { userId: "" })).not.toThrow();
    expect(provider.events).toEqual([]);
  });

  it("validates even when every provider is disabled", () => {
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: recordingProvider("p"), enabled: false }],
      validator: createTestValidator(),
      onValidationError,
    });

    analytics.track("user_registered", { userId: "" });

    expect(onValidationError).toHaveBeenCalledTimes(1);
  });
});

describe("a validator that misbehaves", () => {
  it("fails closed when it throws: nothing is dispatched and the error is reported with its cause", () => {
    const provider = recordingProvider("p");
    const boom = new Error("boom");
    const reported: ValidationError[] = [];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: {
        validate: () => {
          throw boom;
        },
      },
      onValidationError: (error) => reported.push(error),
    });

    expect(() => analytics.track("logout")).not.toThrow();

    expect(provider.events).toEqual([]);
    expect(reported).toEqual([
      { eventName: "logout", issues: [{ message: "Validator threw: boom", path: [] }], cause: boom },
    ]);
    expect(reported[0]?.cause).toBe(boom);
  });

  it("handles a non-Error throw", () => {
    const reported: ValidationError[] = [];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: {
        validate: () => {
          throw "just a string";
        },
      },
      onValidationError: (error) => reported.push(error),
    });

    analytics.track("logout");

    expect(reported[0]?.issues[0]?.message).toBe("Validator threw: just a string");
    expect(reported[0]?.cause).toBe("just a string");
  });

  it("fails closed when it returns something that is not a result", () => {
    const provider = recordingProvider("p");
    const onValidationError = vi.fn();
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: { validate: (() => undefined) as unknown as EventValidator<Inputs, AppEvents>["validate"] },
      onValidationError,
    });

    expect(() => analytics.track("logout")).not.toThrow();

    expect(provider.events).toEqual([]);
    expect(onValidationError).toHaveBeenCalledTimes(1);
    expect(onValidationError.mock.calls[0]?.[0]).toMatchObject({ eventName: "logout" });
  });
});

describe("a failing onValidationError", () => {
  it("does not break tracking when it throws", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: createTestValidator(),
      onValidationError: () => {
        throw new Error("handler failed");
      },
    });

    expect(() => analytics.track("user_registered", { userId: "" })).not.toThrow();
    analytics.track("user_registered", { userId: "u1" });

    expect(provider.events).toHaveLength(1);
  });

  it("does not cause an unhandled rejection when it is an async function that rejects", async () => {
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: createTestValidator(),
      onValidationError: (() => Promise.reject(new Error("async handler failed"))) as () => void,
    });

    const unhandled = await collectUnhandledRejections(() => analytics.track("user_registered", { userId: "" }));

    expect(unhandled).toEqual([]);
  });

  it("does not cause an unhandled rejection when it returns a misbehaving thenable", async () => {
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: createTestValidator(),
      onValidationError: (() => ({
        get then(): never {
          throw new Error("then getter failed");
        },
      })) as unknown as () => void,
    });

    const unhandled = await collectUnhandledRejections(() => analytics.track("user_registered", { userId: "" }));

    expect(unhandled).toEqual([]);
  });
});

describe("provider failure isolation with a validator", () => {
  it("still isolates sync and async provider failures and reports them to onError", async () => {
    const healthy = recordingProvider("healthy");
    const syncError = new Error("sync");
    const asyncError = new Error("async");
    const errors: ProviderError[] = [];
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [
        { provider: throwingProvider("throws", syncError) },
        { provider: rejectingProvider("rejects", asyncError) },
        { provider: healthy },
      ],
      validator: createTestValidator(),
      onError: (error) => errors.push(error),
    });

    const unhandled = await collectUnhandledRejections(() =>
      analytics.track("order_created", { orderId: "1", amount: "5" }),
    );

    expect(unhandled).toEqual([]);
    expect(healthy.events).toEqual([{ name: "order_created", payload: { orderId: "1", amount: 5 } }]);
    expect(errors).toEqual([
      { providerName: "throws", eventName: "order_created", error: syncError },
      { providerName: "rejects", eventName: "order_created", error: asyncError },
    ]);
  });
});

describe("independent instances", () => {
  it("can use different validators for the same event", () => {
    const strictProvider = recordingProvider("p");
    const lenientProvider = recordingProvider("p");
    const strictErrors: ValidationError[] = [];
    const strict = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: strictProvider }],
      validator: createTestValidator(),
      onValidationError: (error) => strictErrors.push(error),
    });
    const lenient = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: lenientProvider }],
      validator: validatorFrom({
        ...rules,
        user_registered: (payload) => ({ success: true, data: { userId: payload.userId || "anonymous" } }),
      }),
    });

    strict.track("user_registered", { userId: "" });
    lenient.track("user_registered", { userId: "" });

    expect(strictProvider.events).toEqual([]);
    expect(strictErrors).toHaveLength(1);
    expect(lenientProvider.events).toEqual([{ name: "user_registered", payload: { userId: "anonymous" } }]);
  });

  it("does not share validation state or callbacks", () => {
    const aErrors = vi.fn();
    const bErrors = vi.fn();
    const a = createAnalytics<AppEvents, Inputs>({ providers: [], validator: createTestValidator(), onValidationError: aErrors });
    createAnalytics<AppEvents, Inputs>({ providers: [], validator: createTestValidator(), onValidationError: bErrors });

    a.track("user_registered", { userId: "" });

    expect(aErrors).toHaveBeenCalledTimes(1);
    expect(bErrors).not.toHaveBeenCalled();
  });

  it("an instance without a validator is unaffected by one with a validator", () => {
    const plain = recordingProvider("p");
    const validated = recordingProvider("p");
    const withoutValidator = createAnalytics<AppEvents>({ providers: [{ provider: plain }] });
    const withValidator = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: validated }],
      validator: createTestValidator(),
    });

    withoutValidator.track("order_created", { orderId: "1", amount: 5 });
    withValidator.track("order_created", { orderId: "1", amount: "abc" });

    expect(plain.events).toHaveLength(1);
    expect(validated.events).toHaveLength(0);
  });
});

describe("configuration snapshot", () => {
  it("ignores changes to the config object after creation", async () => {
    const provider = recordingProvider("p");
    const config = { providers: [{ provider }], validator: createTestValidator() };
    const analytics = createAnalytics<AppEvents, Inputs>(config);

    config.validator = { validate: () => fail("x", "replaced validator") };
    analytics.track("user_registered", { userId: "u1" });
    await nextTurn();

    expect(provider.events).toEqual([{ name: "user_registered", payload: { userId: "u1" } }]);
  });
});
