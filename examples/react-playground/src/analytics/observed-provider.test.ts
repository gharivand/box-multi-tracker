import { createAnalytics } from "box-multi-tracker";
import type { AnalyticsEvent, AnalyticsProvider, ProviderError } from "box-multi-tracker";
import { describe, expect, it } from "vitest";
import type { AppEvents } from "./events";
import { observeProvider } from "./observed-provider";
import type { DeliveryRecorder } from "./observed-provider";

// Unhandled rejections fail the Vitest run, so any observer/logging callback
// that leaked a rejection would fail the tests below even without an assertion.

const EVENT: AnalyticsEvent<AppEvents> = { name: "user_signed_out", payload: undefined };

type Outcome = { status: "ok" } | { status: "error"; error: unknown };

interface RecorderOptions {
  startThrows?: Error;
  succeedThrows?: Error;
  failThrows?: Error;
}

function createRecorder(options: RecorderOptions = {}) {
  const started: string[] = [];
  const outcomes: Outcome[] = [];
  const recorder: DeliveryRecorder = {
    start(providerName) {
      if (options.startThrows) throw options.startThrows;
      started.push(providerName);
      return {
        succeed() {
          outcomes.push({ status: "ok" });
          if (options.succeedThrows) throw options.succeedThrows;
        },
        fail(error) {
          outcomes.push({ status: "error", error });
          if (options.failThrows) throw options.failThrows;
        },
      };
    },
  };
  return { recorder, started, outcomes };
}

/** A provider whose `track` returns whatever the test needs, even non-contract values. */
function providerReturning(produce: () => unknown): AnalyticsProvider<AppEvents> & { calls: number } {
  const provider = {
    name: "p",
    calls: 0,
    track() {
      provider.calls += 1;
      return produce() as void | Promise<void>;
    },
  };
  return provider;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Runs `fn` and returns what it threw, or a marker if it did not throw. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return "did not throw";
}

/** Same provider and recorder through a real SDK instance; returns what `onError` received. */
async function runThroughSdk(provider: AnalyticsProvider<AppEvents>): Promise<ProviderError[]> {
  const reported: ProviderError[] = [];
  const analytics = createAnalytics<AppEvents>({
    providers: [{ provider }],
    onError: (error) => {
      reported.push(error);
    },
  });
  analytics.track("user_signed_out");
  await settle();
  return reported;
}

describe("observeProvider: transparency", () => {
  it("keeps the provider's name", () => {
    const observed = observeProvider(providerReturning(() => undefined), createRecorder().recorder);
    expect(observed.name).toBe("p");
  });

  it("calls the provider once per event and returns its value untouched", () => {
    const value = undefined;
    const provider = providerReturning(() => value);
    const observed = observeProvider(provider, createRecorder().recorder);

    expect(observed.track(EVENT)).toBe(value);
    expect(provider.calls).toBe(1);
  });
});

describe("observeProvider: native promises", () => {
  it("records success after the promise resolves and returns the same promise", async () => {
    const { recorder, started, outcomes } = createRecorder();
    const promise = Promise.resolve();
    const observed = observeProvider(providerReturning(() => promise), recorder);

    const result = observed.track(EVENT);

    expect(result).toBe(promise);
    expect(started).toEqual(["p"]);
    expect(outcomes).toEqual([]); // still pending
    await settle();
    expect(outcomes).toEqual([{ status: "ok" }]);
  });

  it("records the rejection and leaves the original rejection intact", async () => {
    const { recorder, outcomes } = createRecorder();
    const error = new Error("rejected");
    const promise = Promise.reject(error);
    const observed = observeProvider(providerReturning(() => promise), recorder);

    const result = observed.track(EVENT);

    expect(result).toBe(promise);
    await expect(result).rejects.toBe(error); // the caller still sees the original error
    await settle();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "error" });
    expect((outcomes[0] as { error: unknown }).error).toBe(error);
  });
});

describe("observeProvider: thenables and other values", () => {
  it("follows a custom thenable that resolves, and returns the same object", async () => {
    const { recorder, outcomes } = createRecorder();
    const thenable = { then: (onFulfilled: (value: undefined) => void) => onFulfilled(undefined) };
    const observed = observeProvider(providerReturning(() => thenable), recorder);

    expect(observed.track(EVENT)).toBe(thenable);
    await settle();
    expect(outcomes).toEqual([{ status: "ok" }]);
  });

  it("follows a custom thenable that rejects, with the original reason", async () => {
    const { recorder, outcomes } = createRecorder();
    const error = new Error("thenable rejected");
    const thenable = { then: (_: unknown, onRejected: (reason: unknown) => void) => onRejected(error) };
    const observed = observeProvider(providerReturning(() => thenable), recorder);

    expect(observed.track(EVENT)).toBe(thenable);
    await settle();
    expect((outcomes[0] as { error: unknown }).error).toBe(error);
  });

  it("records an unusual thenable whose `then` throws, without throwing itself", async () => {
    const { recorder, outcomes } = createRecorder();
    const error = new Error("then getter threw");
    const odd = {
      get then(): never {
        throw error;
      },
    };
    const observed = observeProvider(providerReturning(() => odd), recorder);

    expect(observed.track(EVENT)).toBe(odd);
    await settle();
    expect((outcomes[0] as { error: unknown }).error).toBe(error);
  });

  it("records an immediate success for a non-promise return value", () => {
    const { recorder, outcomes } = createRecorder();
    const observed = observeProvider(providerReturning(() => undefined), recorder);

    observed.track(EVENT);

    expect(outcomes).toEqual([{ status: "ok" }]); // synchronous, no waiting
  });

  it("treats a non-thenable object result as a success, like the SDK", async () => {
    const { recorder, outcomes } = createRecorder();
    const result = { not: "a promise" };
    const observed = observeProvider(providerReturning(() => result), recorder);

    expect(observed.track(EVENT)).toBe(result);
    await settle();
    expect(outcomes).toEqual([{ status: "ok" }]);
  });

  it.each([
    ["native promise", (error: Error) => Promise.reject(error)],
    ["custom thenable", (error: Error) => ({ then: (_: unknown, onRejected: (r: unknown) => void) => onRejected(error) })],
    [
      "thenable whose then getter throws",
      (error: Error) => ({
        get then(): never {
          throw error;
        },
      }),
    ],
  ])("agrees with the SDK on a rejecting %s", async (_label, makeResult) => {
    const error = new Error("shared failure");
    const { recorder, outcomes } = createRecorder();
    const observed = observeProvider(providerReturning(() => makeResult(error)), recorder);

    const reported = await runThroughSdk(observed);

    // The SDK saw the provider's own failure and reported it...
    expect(reported).toHaveLength(1);
    expect(reported[0]?.providerName).toBe("p");
    expect(reported[0]?.error).toBe(error);
    // ...and the recorder recorded the very same failure.
    expect((outcomes[0] as { error: unknown }).error).toBe(error);
  });

  it("agrees with the SDK on a resolving custom thenable (no report, success recorded)", async () => {
    const { recorder, outcomes } = createRecorder();
    const thenable = { then: (onFulfilled: (value: undefined) => void) => onFulfilled(undefined) };
    const observed = observeProvider(providerReturning(() => thenable), recorder);

    expect(await runThroughSdk(observed)).toEqual([]);
    expect(outcomes).toEqual([{ status: "ok" }]);
  });
});

describe("observeProvider: synchronous exceptions", () => {
  it("rethrows the provider's exact error and records it synchronously", () => {
    const { recorder, outcomes } = createRecorder();
    const error = new Error("sync failure");
    const observed = observeProvider(
      providerReturning(() => {
        throw error;
      }),
      recorder,
    );

    expect(caught(() => observed.track(EVENT))).toBe(error);
    expect(outcomes).toHaveLength(1);
    expect((outcomes[0] as { error: unknown }).error).toBe(error);
  });

  it("lets the SDK report the synchronous error as it would without the decorator", async () => {
    const error = new Error("sync failure");
    const { recorder } = createRecorder();
    const observed = observeProvider(
      providerReturning(() => {
        throw error;
      }),
      recorder,
    );

    const reported = await runThroughSdk(observed);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.error).toBe(error);
  });
});

describe("observeProvider: failing observer/logging callbacks", () => {
  it("still calls the provider and returns its value when `start` throws", () => {
    const { recorder, outcomes } = createRecorder({ startThrows: new Error("start failed") });
    const provider = providerReturning(() => undefined);
    const observed = observeProvider(provider, recorder);

    expect(() => observed.track(EVENT)).not.toThrow();
    expect(provider.calls).toBe(1);
    expect(outcomes).toEqual([]);
  });

  it("still rethrows the provider's own sync error when `start` throws", () => {
    const error = new Error("provider failed");
    const { recorder } = createRecorder({ startThrows: new Error("start failed") });
    const observed = observeProvider(
      providerReturning(() => {
        throw error;
      }),
      recorder,
    );

    expect(caught(() => observed.track(EVENT))).toBe(error);
  });

  it("does not throw when `succeed` throws on an immediate result", () => {
    const { recorder } = createRecorder({ succeedThrows: new Error("log failed") });
    const observed = observeProvider(providerReturning(() => undefined), recorder);

    expect(() => observed.track(EVENT)).not.toThrow();
  });

  it("rethrows the provider's error, not the logger's, when `fail` throws on a sync error", () => {
    const error = new Error("provider failed");
    const { recorder } = createRecorder({ failThrows: new Error("log failed") });
    const observed = observeProvider(
      providerReturning(() => {
        throw error;
      }),
      recorder,
    );

    expect(caught(() => observed.track(EVENT))).toBe(error);
  });

  it("creates no unhandled rejection when `succeed` throws after an async success", async () => {
    const { recorder, outcomes } = createRecorder({ succeedThrows: new Error("log failed") });
    const promise = Promise.resolve();
    const observed = observeProvider(providerReturning(() => promise), recorder);

    expect(observed.track(EVENT)).toBe(promise);
    await settle();
    await settle();
    expect(outcomes).toEqual([{ status: "ok" }]);
  });

  it("keeps the original rejection and creates no unhandled rejection when `fail` throws", async () => {
    const error = new Error("provider rejected");
    const { recorder } = createRecorder({ failThrows: new Error("log failed") });
    const promise = Promise.reject(error);
    const observed = observeProvider(providerReturning(() => promise), recorder);

    const result = observed.track(EVENT);

    await expect(result).rejects.toBe(error);
    await settle();
    await settle();
  });

  it("does not stop the SDK from reporting the provider's failure when every callback throws", async () => {
    const error = new Error("provider rejected");
    const { recorder } = createRecorder({ succeedThrows: new Error("a"), failThrows: new Error("b") });
    const observed = observeProvider(providerReturning(() => Promise.reject(error)), recorder);

    const reported = await runThroughSdk(observed);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.error).toBe(error);
  });
});
