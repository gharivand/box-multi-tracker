import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { createAnalytics } from "../src/index.js";
import type { EventValidator, ProviderError, ValidationError } from "../src/index.js";
import { createDebugLogger } from "../src/debug/index.js";
import type { DebugLogLevel } from "../src/debug/index.js";
import {
  collectUnhandledRejections,
  nextTurn,
  recordingProvider,
  rejectingProvider,
  testGlobals,
  throwingProvider,
} from "./helpers.js";
import type { AppEvents } from "./helpers.js";

const PREFIX = "[box-multi-tracker]";
const SECRET = "payload-secret-value-4f9c";

type Method = "error" | "warn" | "debug";
const spies = {} as Record<Method, MockInstance>;

beforeEach(() => {
  for (const method of ["error", "warn", "debug"] as const) {
    spies[method] = vi.spyOn(testGlobals.console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

const total = (): number => spies.error.mock.calls.length + spies.warn.mock.calls.length + spies.debug.mock.calls.length;
const messageOf = (method: Method, call = 0): string => String(spies[method].mock.calls[call]?.[0]);
const detailsOf = (call = 0): Record<string, unknown> => spies.debug.mock.calls[call]?.[1] as Record<string, unknown>;

/** Everything written to the console, as one string. */
function everythingLogged(): string {
  const calls = (["error", "warn", "debug"] as const).map((method) => spies[method].mock.calls);
  return JSON.stringify(calls, (_key, value: unknown) =>
    value instanceof Error ? { name: value.name, message: value.message } : value === undefined ? "<undefined>" : value,
  );
}

const providerError = (error: unknown = new Error("provider exploded")): ProviderError => ({
  providerName: "flaky",
  eventName: "order_created",
  error,
});

const failure: ValidationError = {
  eventName: "order_created",
  issues: [
    { message: "must be numeric", path: ["amount"] },
    { message: "required", path: ["orderId"] },
  ],
};

const exception = (cause: unknown): ValidationError => ({
  eventName: "order_created",
  issues: [{ message: "Validator threw: x", path: [] }],
  cause,
});

describe("disabled logger", () => {
  it("is disabled by default", () => {
    for (const logger of [createDebugLogger(), createDebugLogger({}), createDebugLogger({ level: "debug" })]) {
      logger.onProviderError(providerError());
      logger.onValidationError(failure);
      logger.onValidationError(exception(new Error("boom")));
    }

    expect(total()).toBe(0);
  });

  it("produces no console output at any level when disabled explicitly", () => {
    for (const level of ["error", "warn", "debug"] as const) {
      const logger = createDebugLogger({ enabled: false, level });
      logger.onProviderError(providerError());
      logger.onValidationError(failure);
      logger.onValidationError(exception(undefined));
    }

    expect(total()).toBe(0);
  });

  it("returns before touching its argument", () => {
    const logger = createDebugLogger({ enabled: false });
    const trap = new Proxy({}, { get: () => { throw new Error("read"); }, has: () => { throw new Error("read"); } });

    expect(() => logger.onProviderError(trap as unknown as ProviderError)).not.toThrow();
    expect(() => logger.onValidationError(trap as unknown as ValidationError)).not.toThrow();
    expect(total()).toBe(0);
  });

  it("treats anything but true as disabled", () => {
    for (const enabled of ["true", 1, null, {}] as unknown[]) {
      createDebugLogger({ enabled } as never).onProviderError(providerError());
    }

    expect(total()).toBe(0);
  });
});

describe("provider errors", () => {
  it.each(["error", "warn", "debug"] as const)("use console.error at level %s", (level) => {
    createDebugLogger({ enabled: true, level }).onProviderError(providerError());

    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(spies.warn).not.toHaveBeenCalled();
    expect(messageOf("error")).toBe(
      `${PREFIX} Provider "flaky" failed while tracking "order_created": Error: provider exploded`,
    );
  });

  it("describes a thrown non-Error without printing it as text", () => {
    createDebugLogger({ enabled: true, level: "error" }).onProviderError(providerError(SECRET));

    expect(messageOf("error")).toBe(
      `${PREFIX} Provider "flaky" failed while tracking "order_created": a non-Error value was thrown`,
    );
    expect(everythingLogged()).not.toContain(SECRET);
  });

  it("still logs when the error's own properties throw", () => {
    const hostile = new Error("x");
    Object.defineProperty(hostile, "message", { get: () => { throw new Error("getter"); } });

    createDebugLogger({ enabled: true, level: "error" }).onProviderError(providerError(hostile));

    expect(messageOf("error")).toContain("an unreadable value was thrown");
  });
});

describe("validation errors", () => {
  it.each(["error", "warn", "debug"] as const)("a validator exception uses console.error at level %s", (level) => {
    createDebugLogger({ enabled: true, level }).onValidationError(exception(new TypeError("validator exploded")));

    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(spies.warn).not.toHaveBeenCalled();
    expect(messageOf("error")).toBe(`${PREFIX} Validator threw while validating "order_created": TypeError: validator exploded`);
  });

  it.each([undefined, null, "text", 0, { code: 1 }] as unknown[])(
    "a validator exception is recognized by the cause property, whatever was thrown (%o)",
    (thrown) => {
      createDebugLogger({ enabled: true, level: "error" }).onValidationError(exception(thrown));

      expect(spies.error).toHaveBeenCalledTimes(1);
      expect(spies.warn).not.toHaveBeenCalled();
    },
  );

  it.each(["warn", "debug"] as const)("a normal validation failure uses console.warn at level %s", (level) => {
    createDebugLogger({ enabled: true, level }).onValidationError(failure);

    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).not.toHaveBeenCalled();
    expect(messageOf("warn")).toBe(`${PREFIX} Validation failed for "order_created" (2 issues)`);
  });

  it("uses the singular for one issue", () => {
    createDebugLogger({ enabled: true, level: "warn" }).onValidationError({ ...failure, issues: [{ message: "m", path: [] }] });

    expect(messageOf("warn")).toBe(`${PREFIX} Validation failed for "order_created" (1 issue)`);
  });
});

describe("levels", () => {
  const logEverything = (level: DebugLogLevel): void => {
    const logger = createDebugLogger({ enabled: true, level });
    logger.onProviderError(providerError());
    logger.onValidationError(exception(new Error("boom")));
    logger.onValidationError(failure);
  };

  it('"error" logs errors only', () => {
    logEverything("error");

    expect(spies.error).toHaveBeenCalledTimes(2);
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it('"warn" logs warnings and errors, without details', () => {
    logEverything("warn");

    expect(spies.error).toHaveBeenCalledTimes(2);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it('"debug" logs warnings and errors, each followed by a details line', () => {
    logEverything("debug");

    expect(spies.error).toHaveBeenCalledTimes(2);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.debug).toHaveBeenCalledTimes(3);
  });

  it('defaults to "debug"', () => {
    const logger = createDebugLogger({ enabled: true });
    logger.onValidationError(failure);

    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.debug).toHaveBeenCalledTimes(1);
  });

  it('falls back to "debug" for a level a JavaScript caller got wrong', () => {
    createDebugLogger({ enabled: true, level: "verbose" as never }).onValidationError(failure);

    expect(spies.debug).toHaveBeenCalledTimes(1);
  });

  it("does not mix up unlike levels between loggers", () => {
    const quiet = createDebugLogger({ enabled: true, level: "error" });
    const loud = createDebugLogger({ enabled: true, level: "debug" });

    quiet.onValidationError(failure);
    expect(total()).toBe(0);
    loud.onValidationError(failure);
    expect(total()).toBe(2);
  });
});

describe("details at level debug", () => {
  it("a provider error carries provider, event and the error itself", () => {
    const error = new Error("provider exploded");
    createDebugLogger({ enabled: true }).onProviderError(providerError(error));

    expect(messageOf("debug")).toBe(`${PREFIX} details`);
    expect(detailsOf()).toEqual({ providerName: "flaky", eventName: "order_created", error });
    expect(detailsOf().error).toBe(error); // the same object, for its stack
  });

  it("a validation failure carries event, issues and validatorException: false", () => {
    createDebugLogger({ enabled: true }).onValidationError(failure);

    expect(detailsOf()).toEqual({ eventName: "order_created", issues: failure.issues, validatorException: false });
    expect(detailsOf()).not.toHaveProperty("cause");
  });

  it("a validator exception carries the cause, even when it is undefined", () => {
    const cause = new Error("validator exploded");
    const logger = createDebugLogger({ enabled: true });

    logger.onValidationError(exception(cause));
    logger.onValidationError(exception(undefined));

    expect(detailsOf(0)).toMatchObject({ eventName: "order_created", validatorException: true, cause });
    expect(detailsOf(1)).toMatchObject({ validatorException: true });
    expect(detailsOf(1)).toHaveProperty("cause", undefined);
  });

  it("prefixes every line", () => {
    const logger = createDebugLogger({ enabled: true });
    logger.onProviderError(providerError());
    logger.onValidationError(failure);
    logger.onValidationError(exception(new Error("x")));

    for (const method of ["error", "warn", "debug"] as const) {
      for (const [message] of spies[method].mock.calls) expect(String(message).startsWith(`${PREFIX} `)).toBe(true);
    }
  });

  it("writes two lines per failure, not more", () => {
    createDebugLogger({ enabled: true }).onProviderError(providerError());

    expect(total()).toBe(2);
  });
});

describe("isolation", () => {
  it.each(["error", "warn", "debug"] as const)("swallows a throwing console.%s", (method) => {
    spies[method].mockImplementation(() => {
      throw new Error("console is broken");
    });
    const logger = createDebugLogger({ enabled: true });

    expect(() => logger.onProviderError(providerError())).not.toThrow();
    expect(() => logger.onValidationError(failure)).not.toThrow();
    expect(() => logger.onValidationError(exception(new Error("x")))).not.toThrow();
  });

  it("keeps writing the other lines when one console method throws", () => {
    spies.error.mockImplementation(() => {
      throw new Error("console.error is broken");
    });

    createDebugLogger({ enabled: true }).onProviderError(providerError());

    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(spies.debug).toHaveBeenCalledTimes(1);
  });

  it("does not log its own failure again", () => {
    for (const method of ["error", "warn", "debug"] as const) {
      spies[method].mockImplementation(() => {
        throw new Error("console is broken");
      });
    }

    createDebugLogger({ enabled: true }).onProviderError(providerError());

    expect(total()).toBe(2); // one attempt per line, no retry and no report of the failure
  });

  it("returns undefined and creates no unhandled rejection", async () => {
    spies.error.mockImplementation(() => {
      throw new Error("console is broken");
    });
    const logger = createDebugLogger({ enabled: true });
    const results: unknown[] = [];

    const rejections = await collectUnhandledRejections(() => {
      results.push(logger.onProviderError(providerError()), logger.onValidationError(failure));
    });

    expect(results).toEqual([undefined, undefined]);
    expect(rejections).toEqual([]);
  });

  it("neither throws nor logs for malformed arguments", () => {
    const logger = createDebugLogger({ enabled: true });
    const bad = [undefined, null, 1, "x", {}, { eventName: "e" }, { eventName: "e", issues: null }] as unknown[];

    for (const value of bad) {
      expect(() => logger.onProviderError(value as ProviderError)).not.toThrow();
      expect(() => logger.onValidationError(value as ValidationError)).not.toThrow();
    }
  });

  it("survives a hostile argument", () => {
    const logger = createDebugLogger({ enabled: true });
    const hostile = new Proxy({}, { get: () => { throw new Error("get"); }, has: () => { throw new Error("has"); }, getOwnPropertyDescriptor: () => { throw new Error("gopd"); } });

    expect(() => logger.onProviderError(hostile as unknown as ProviderError)).not.toThrow();
    expect(() => logger.onValidationError(hostile as unknown as ValidationError)).not.toThrow();
  });

  it("only reads the error objects it receives", () => {
    // A frozen report: any write would throw, be swallowed, and leave the console empty.
    const frozenIssues = Object.freeze([Object.freeze({ message: "m", path: Object.freeze(["amount"]) })]);
    const frozenFailure = Object.freeze({ eventName: "order_created", issues: frozenIssues });
    const frozenProvider = Object.freeze({ ...providerError(Object.freeze(new Error("x"))) });
    const logger = createDebugLogger({ enabled: true });

    logger.onValidationError(frozenFailure);
    logger.onProviderError(frozenProvider);

    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(frozenFailure).toEqual({ eventName: "order_created", issues: [{ message: "m", path: ["amount"] }] });
  });

  it("works when its handlers are destructured", () => {
    const { onProviderError, onValidationError } = createDebugLogger({ enabled: true, level: "warn" });

    onProviderError(providerError());
    onValidationError(failure);

    expect(total()).toBe(2);
  });

  it("exposes exactly the two handlers", () => {
    expect(Object.keys(createDebugLogger()).sort()).toEqual(["onProviderError", "onValidationError"]);
  });
});

describe("with createAnalytics", () => {
  interface Inputs {
    user_registered: { userId: string };
    order_created: { orderId: string; amount: number };
    logout: undefined;
  }

  function validatorWith(validate: (name: string, payload: unknown) => ReturnType<EventValidator<Inputs, AppEvents>["validate"]>) {
    return { validate } as unknown as EventValidator<Inputs, AppEvents>;
  }

  const acceptAll = validatorWith((_name, payload) => ({ success: true, data: payload as never }));

  it("logs a provider failure (sync and async) and still delivers to the other providers", async () => {
    const other = recordingProvider("other");
    const logger = createDebugLogger({ enabled: true, level: "error" });
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: throwingProvider("sync-fail", new Error("sync")) },
        { provider: rejectingProvider("async-fail", new Error("async")) },
        { provider: other },
      ],
      onError: logger.onProviderError,
    });

    analytics.track("order_created", { orderId: "o-1", amount: 5 });
    await nextTurn();

    expect(spies.error).toHaveBeenCalledTimes(2);
    expect(messageOf("error", 0)).toContain('Provider "sync-fail"');
    expect(messageOf("error", 1)).toContain('Provider "async-fail"');
    expect(other.events).toHaveLength(1);
  });

  it("logs an ordinary validation failure as a warning and delivers nothing", () => {
    const provider = recordingProvider("p");
    const logger = createDebugLogger({ enabled: true, level: "warn" });
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider }],
      validator: validatorWith(() => ({ success: false, issues: [{ message: "bad", path: ["amount"] }] })),
      onValidationError: logger.onValidationError,
    });

    analytics.track("order_created", { orderId: "o-1", amount: 5 });

    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).not.toHaveBeenCalled();
    expect(provider.events).toEqual([]);
  });

  it.each([new Error("validator exploded"), undefined] as unknown[])(
    "logs a validator that throws (%o) as an error",
    (thrown) => {
      const logger = createDebugLogger({ enabled: true, level: "error" });
      const analytics = createAnalytics<AppEvents, Inputs>({
        providers: [],
        validator: validatorWith(() => {
          throw thrown;
        }),
        onValidationError: logger.onValidationError,
      });

      analytics.track("order_created", { orderId: "o-1", amount: 5 });

      expect(spies.error).toHaveBeenCalledTimes(1);
      expect(messageOf("error")).toContain('Validator threw while validating "order_created"');
    },
  );

  it("logs nothing for a successful dispatch", () => {
    const logger = createDebugLogger({ enabled: true });
    const analytics = createAnalytics<AppEvents, Inputs>({
      providers: [{ provider: recordingProvider("p") }],
      validator: acceptAll,
      onError: logger.onProviderError,
      onValidationError: logger.onValidationError,
    });

    analytics.track("order_created", { orderId: "o-1", amount: 5 });
    analytics.enableProvider("p");
    analytics.disableProvider("p");

    expect(total()).toBe(0);
  });

  it("never logs the tracked payload or the event", async () => {
    const logger = createDebugLogger({ enabled: true, level: "debug" });
    const payload = { orderId: SECRET, amount: 5 };
    const failing = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("a", new Error("sync")) }, { provider: rejectingProvider("b", new Error("async")) }],
      onError: logger.onProviderError,
    });
    const invalid = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: validatorWith(() => ({ success: false, issues: [{ message: "bad", path: ["orderId"] }] })),
      onValidationError: logger.onValidationError,
    });
    const crashing = createAnalytics<AppEvents, Inputs>({
      providers: [],
      validator: validatorWith(() => {
        throw new Error("validator exploded");
      }),
      onValidationError: logger.onValidationError,
    });

    failing.track("order_created", payload);
    invalid.track("order_created", payload);
    crashing.track("order_created", payload);
    await nextTurn();

    expect(total()).toBeGreaterThan(0);
    expect(everythingLogged()).not.toContain(SECRET);
  });

  it("does not interfere with tracking when the console is broken", async () => {
    for (const method of ["error", "warn", "debug"] as const) {
      spies[method].mockImplementation(() => {
        throw new Error("console is broken");
      });
    }
    const other = recordingProvider("other");
    const logger = createDebugLogger({ enabled: true });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("a", new Error("x")) }, { provider: other }],
      onError: logger.onProviderError,
    });

    const rejections = await collectUnhandledRejections(() => analytics.track("order_created", { orderId: "o-1", amount: 5 }));

    expect(other.events).toHaveLength(1);
    expect(rejections).toEqual([]);
  });
});
