import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnalytics } from "../src/index.js";
import type { AnalyticsProvider, ProviderEntry, ProviderError } from "../src/index.js";
import {
  collectUnhandledRejections,
  deferred,
  neverSettlingProvider,
  nextTurn,
  providerReturning,
  recordingProvider,
  rejectingProvider,
  testGlobals,
  throwingProvider,
} from "./helpers.js";
import type { AppEvents } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("factory and instance isolation", () => {
  it("exposes exactly the four API methods", () => {
    const analytics = createAnalytics<AppEvents>({ providers: [] });

    expect(Object.keys(analytics).sort()).toEqual([
      "disableProvider",
      "enableProvider",
      "isProviderEnabled",
      "track",
    ]);
  });

  it("creates independent state for each instance", () => {
    const shared = recordingProvider("shared");
    const a = createAnalytics<AppEvents>({ providers: [{ provider: shared }] });
    const b = createAnalytics<AppEvents>({ providers: [{ provider: shared }] });

    a.disableProvider("shared");

    expect(a.isProviderEnabled("shared")).toBe(false);
    expect(b.isProviderEnabled("shared")).toBe(true);

    a.track("logout");
    expect(shared.events).toHaveLength(0);
    b.track("logout");
    expect(shared.events).toHaveLength(1);
  });

  it("works when methods are destructured (no `this` dependency)", () => {
    const provider = recordingProvider("p");
    const { track, enableProvider, disableProvider, isProviderEnabled } =
      createAnalytics<AppEvents>({ providers: [{ provider }] });

    track("logout");
    disableProvider("p");
    expect(isProviderEnabled("p")).toBe(false);
    track("logout");
    enableProvider("p");
    expect(isProviderEnabled("p")).toBe(true);
    track("logout");

    expect(provider.events).toHaveLength(2);
  });

  it("accepts an empty provider configuration", () => {
    const analytics = createAnalytics<AppEvents>({ providers: [] });

    expect(() => analytics.track("user_registered", { userId: "1" })).not.toThrow();
    expect(analytics.isProviderEnabled("anything")).toBe(false);
  });

  it("is not affected by mutating the original providers array", () => {
    const first = recordingProvider("first");
    const late = recordingProvider("late");
    const providers: ProviderEntry<AppEvents>[] = [{ provider: first }];
    const analytics = createAnalytics<AppEvents>({ providers });

    providers.push({ provider: late });
    analytics.track("logout");
    expect(late.events).toHaveLength(0);
    expect(analytics.isProviderEnabled("late")).toBe(false);
    expect(() => analytics.enableProvider("late")).toThrow();

    providers.length = 0;
    analytics.track("logout");
    expect(first.events).toHaveLength(2);
  });

  it("is not affected by mutating an original entry's `enabled` or `provider`", () => {
    const original = recordingProvider("p");
    const replacement = recordingProvider("replacement");
    const disabledEntry: ProviderEntry<AppEvents> = { provider: recordingProvider("off"), enabled: false };
    const entry: ProviderEntry<AppEvents> = { provider: original, enabled: true };
    const analytics = createAnalytics<AppEvents>({ providers: [entry, disabledEntry] });

    entry.enabled = false;
    entry.provider = replacement;
    disabledEntry.enabled = true;
    analytics.track("logout");

    expect(analytics.isProviderEnabled("p")).toBe(true);
    expect(original.events).toHaveLength(1);
    expect(replacement.events).toHaveLength(0);
    expect(analytics.isProviderEnabled("off")).toBe(false);
  });

  it("throws on duplicate provider names during construction", () => {
    expect(() =>
      createAnalytics<AppEvents>({
        providers: [{ provider: recordingProvider("dup") }, { provider: recordingProvider("dup") }],
      }),
    ).toThrow(/duplicate.*"dup"/i);
  });
});

describe("event dispatch", () => {
  it("dispatches to all enabled providers", () => {
    const a = recordingProvider("a");
    const b = recordingProvider("b");
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider: a }, { provider: b }] });

    analytics.track("order_created", { orderId: "1", amount: 250000 });

    for (const provider of [a, b]) {
      expect(provider.events).toEqual([
        { name: "order_created", payload: { orderId: "1", amount: 250000 } },
      ]);
    }
  });

  it("dispatches in registration order", () => {
    const log: string[] = [];
    const analytics = createAnalytics<AppEvents>({
      providers: ["c", "a", "b"].map((name) => ({ provider: recordingProvider(name, log) })),
    });

    analytics.track("logout");

    expect(log).toEqual(["c", "a", "b"]);
  });

  it("skips providers that are disabled", () => {
    const on = recordingProvider("on");
    const off = recordingProvider("off");
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: on }, { provider: off, enabled: false }],
    });

    analytics.track("logout");

    expect(on.events).toHaveLength(1);
    expect(off.events).toHaveLength(0);
  });

  it("sends the same event object to all providers without cloning the payload", () => {
    const a = recordingProvider("a");
    const b = recordingProvider("b");
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider: a }, { provider: b }] });
    const payload = { userId: "1" };

    analytics.track("user_registered", payload);

    const [eventA] = a.events;
    const [eventB] = b.events;
    expect(eventA).toBeDefined();
    expect(eventA).toBe(eventB);
    expect(eventA?.payload).toBe(payload);
  });

  it("builds an event with only `name` and `payload`", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider }] });

    analytics.track("logout");

    expect(Object.keys(provider.events[0] ?? {}).sort()).toEqual(["name", "payload"]);
  });

  it("supports events with and without payloads", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider }] });

    analytics.track("user_registered", { userId: "123" });
    analytics.track("logout");

    expect(provider.events).toEqual([
      { name: "user_registered", payload: { userId: "123" } },
      { name: "logout", payload: undefined },
    ]);
  });

  it("returns void without waiting for providers", () => {
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: neverSettlingProvider("slow") }],
    });

    expect(analytics.track("logout")).toBeUndefined();
  });

  it("delivers the current event to a provider disabled during dispatch, but not the next one", () => {
    const b = recordingProvider("b");
    const a: AnalyticsProvider<AppEvents> = {
      name: "a",
      track() {
        analytics.disableProvider("b");
      },
    };
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider: a }, { provider: b }] });

    analytics.track("user_registered", { userId: "first" });
    expect(analytics.isProviderEnabled("b")).toBe(false);
    expect(b.events).toEqual([{ name: "user_registered", payload: { userId: "first" } }]);

    analytics.track("user_registered", { userId: "second" });
    expect(b.events).toHaveLength(1);
  });

  it("does not deliver the current event to a provider enabled during dispatch, only the next one", () => {
    const b = recordingProvider("b");
    const a: AnalyticsProvider<AppEvents> = {
      name: "a",
      track() {
        analytics.enableProvider("b");
      },
    };
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: a }, { provider: b, enabled: false }],
    });

    analytics.track("user_registered", { userId: "first" });
    expect(analytics.isProviderEnabled("b")).toBe(true);
    expect(b.events).toHaveLength(0);

    analytics.track("user_registered", { userId: "second" });
    expect(b.events).toEqual([{ name: "user_registered", payload: { userId: "second" } }]);
  });

  it("drops events sent while disabled and does not replay them after enabling", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider, enabled: false }] });

    analytics.track("user_registered", { userId: "dropped" });
    analytics.enableProvider("p");
    expect(provider.events).toHaveLength(0);

    analytics.track("user_registered", { userId: "kept" });
    expect(provider.events).toEqual([{ name: "user_registered", payload: { userId: "kept" } }]);
  });
});

describe("provider management", () => {
  it("enables and disables providers", () => {
    const provider = recordingProvider("p");
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider }] });
    expect(analytics.isProviderEnabled("p")).toBe(true);

    analytics.disableProvider("p");
    expect(analytics.isProviderEnabled("p")).toBe(false);
    analytics.track("logout");
    expect(provider.events).toHaveLength(0);

    analytics.enableProvider("p");
    expect(analytics.isProviderEnabled("p")).toBe(true);
    analytics.track("logout");
    expect(provider.events).toHaveLength(1);
  });

  it("respects `enabled: false` from the configuration", () => {
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: recordingProvider("p"), enabled: false }],
    });

    expect(analytics.isProviderEnabled("p")).toBe(false);
  });

  it("only changes the targeted provider", () => {
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: recordingProvider("a") }, { provider: recordingProvider("b") }],
    });

    analytics.disableProvider("a");

    expect(analytics.isProviderEnabled("a")).toBe(false);
    expect(analytics.isProviderEnabled("b")).toBe(true);
  });

  it("throws a clear error for unknown names when enabling or disabling", () => {
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider: recordingProvider("known") }] });

    expect(() => analytics.enableProvider("nope")).toThrow(/unknown.*"nope".*"known"/i);
    expect(() => analytics.disableProvider("nope")).toThrow(/unknown.*"nope".*"known"/i);
  });

  it("returns false from isProviderEnabled for unknown names", () => {
    const analytics = createAnalytics<AppEvents>({ providers: [] });

    expect(analytics.isProviderEnabled("nope")).toBe(false);
  });

  it("does not let state changes in one instance affect another", () => {
    const a = createAnalytics<AppEvents>({ providers: [{ provider: recordingProvider("p") }] });
    const b = createAnalytics<AppEvents>({ providers: [{ provider: recordingProvider("p") }] });

    a.disableProvider("p");
    b.enableProvider("p");

    expect(a.isProviderEnabled("p")).toBe(false);
    expect(b.isProviderEnabled("p")).toBe(true);
  });
});

describe("error isolation", () => {
  it("does not stop later providers when a provider throws synchronously", () => {
    const before = recordingProvider("before");
    const after = recordingProvider("after");
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: before },
        { provider: throwingProvider("bad", new Error("sync")) },
        { provider: after },
      ],
    });

    expect(() => analytics.track("logout")).not.toThrow();

    expect(before.events).toHaveLength(1);
    expect(after.events).toHaveLength(1);
  });

  it("does not stop other providers when a provider's promise rejects", () => {
    const before = recordingProvider("before");
    const after = recordingProvider("after");
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: before },
        { provider: rejectingProvider("bad", new Error("async")) },
        { provider: after },
      ],
      onError: () => {},
    });

    expect(() => analytics.track("logout")).not.toThrow();

    expect(before.events).toHaveLength(1);
    expect(after.events).toHaveLength(1);
  });

  it("reports synchronous exceptions synchronously", () => {
    const onError = vi.fn();
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("bad", new Error("sync")) }],
      onError,
    });

    analytics.track("logout");

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports asynchronous failures once the promise rejects", async () => {
    const error = new Error("async");
    const reported = deferred<ProviderError>();
    const onError = vi.fn((e: ProviderError) => reported.resolve(e));
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: rejectingProvider("bad", error) }],
      onError,
    });

    analytics.track("logout");
    expect(onError).not.toHaveBeenCalled();

    expect(await reported.promise).toEqual({ providerName: "bad", eventName: "logout", error });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports the provider name, event name and original error", () => {
    const syncError = new Error("sync");
    const reports: ProviderError[] = [];
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: recordingProvider("fine") },
        { provider: throwingProvider("exploding", syncError) },
      ],
      onError: (e) => reports.push(e),
    });

    analytics.track("order_created", { orderId: "1", amount: 5 });

    expect(reports).toEqual([
      { providerName: "exploding", eventName: "order_created", error: syncError },
    ]);
  });

  it("preserves non-Error values thrown by providers", () => {
    const reports: ProviderError[] = [];
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("bad", "just a string") }],
      onError: (e) => reports.push(e),
    });

    analytics.track("logout");

    expect(reports[0]?.error).toBe("just a string");
  });

  it("never exposes the event payload in the error context", async () => {
    const payload = { userId: "secret-user-id" };
    const reports: ProviderError[] = [];
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: throwingProvider("sync", new Error("sync")) },
        { provider: rejectingProvider("async", new Error("async")) },
      ],
      onError: (e) => reports.push(e),
    });

    analytics.track("user_registered", payload);
    await nextTurn();

    expect(reports).toHaveLength(2);
    for (const report of reports) {
      expect(Object.keys(report).sort()).toEqual(["error", "eventName", "providerName"]);
      expect(Object.values(report)).not.toContain(payload);
      expect(JSON.stringify(Object.values(report))).not.toContain("secret-user-id");
    }
  });

  it("silently ignores failures when `onError` is not provided", async () => {
    const after = recordingProvider("after");
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: throwingProvider("sync", new Error("sync")) },
        { provider: rejectingProvider("async", new Error("async")) },
        { provider: after },
      ],
    });

    const unhandled = await collectUnhandledRejections(() => {
      expect(() => analytics.track("logout")).not.toThrow();
    });

    expect(unhandled).toEqual([]);
    expect(after.events).toHaveLength(1);
  });

  it("swallows a synchronous exception thrown by `onError`", () => {
    const after = recordingProvider("after");
    const onError = vi.fn(() => {
      throw new Error("handler failed");
    });
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("bad", new Error("sync")) }, { provider: after }],
      onError,
    });

    expect(() => analytics.track("logout")).not.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(after.events).toHaveLength(1);
  });

  it("swallows an asynchronous rejection from `onError`", async () => {
    const after = recordingProvider("after");
    const onError = vi.fn(() => Promise.reject(new Error("handler rejected")));
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: throwingProvider("sync", new Error("sync")) },
        { provider: rejectingProvider("async", new Error("async")) },
        { provider: after },
      ],
      onError,
    });

    const unhandled = await collectUnhandledRejections(() => analytics.track("logout"));

    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(after.events).toHaveLength(1);
  });

  it("swallows an `onError` result whose `then` getter throws", async () => {
    const onError = vi.fn(() => ({
      get then(): never {
        throw new Error("getter failed");
      },
    }));
    const after = recordingProvider("after");
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: throwingProvider("bad", new Error("sync")) }, { provider: after }],
      onError,
    });

    const unhandled = await collectUnhandledRejections(() => analytics.track("logout"));

    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(after.events).toHaveLength(1);
  });

  it("handles a provider result with a throwing `then` getter without an unhandled rejection", async () => {
    const getterError = new Error("getter failed");
    const thenable = {
      get then(): never {
        throw getterError;
      },
    };
    const reports: ProviderError[] = [];
    const after = recordingProvider("after");
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: providerReturning("odd", thenable) }, { provider: after }],
      onError: (e) => reports.push(e),
    });

    const unhandled = await collectUnhandledRejections(() => {
      expect(() => analytics.track("logout")).not.toThrow();
    });

    expect(unhandled).toEqual([]);
    expect(after.events).toHaveLength(1);
    expect(reports).toEqual([{ providerName: "odd", eventName: "logout", error: getterError }]);
  });

  it("reports unusual thenables at most once", async () => {
    const thenError = new Error("then threw");
    const rejectError = new Error("first rejection");
    const reports: ProviderError[] = [];
    const analytics = createAnalytics<AppEvents>({
      providers: [
        {
          provider: providerReturning("then-throws", {
            then() {
              throw thenError;
            },
          }),
        },
        {
          provider: providerReturning("settles-repeatedly", {
            then(resolve: () => void, reject: (reason: unknown) => void) {
              reject(rejectError);
              reject(new Error("second rejection"));
              resolve();
            },
          }),
        },
        {
          provider: providerReturning("resolves", {
            then(resolve: () => void) {
              resolve();
            },
          }),
        },
      ],
      onError: (e) => reports.push(e),
    });

    const unhandled = await collectUnhandledRejections(() => analytics.track("logout"));

    expect(unhandled).toEqual([]);
    expect([...reports].sort((x, y) => x.providerName.localeCompare(y.providerName))).toEqual([
      { providerName: "settles-repeatedly", eventName: "logout", error: rejectError },
      { providerName: "then-throws", eventName: "logout", error: thenError },
    ]);
  });

  it("is not blocked by a provider whose promise never settles", async () => {
    const onError = vi.fn();
    const after = recordingProvider("after");
    const analytics = createAnalytics<AppEvents>({
      providers: [{ provider: neverSettlingProvider("hung") }, { provider: after }],
      onError,
    });

    expect(analytics.track("logout")).toBeUndefined();
    expect(after.events).toHaveLength(1);

    await nextTurn();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("contract boundaries", () => {
  it("does not log to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((method) =>
      vi.spyOn(testGlobals.console, method).mockImplementation(() => {}),
    );
    const analytics = createAnalytics<AppEvents>({
      providers: [
        { provider: throwingProvider("sync", new Error("sync")) },
        { provider: rejectingProvider("async", new Error("async")) },
      ],
    });

    analytics.track("logout");
    await nextTurn();

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("delivers every event to every enabled provider, whatever the provider handles", () => {
    const handled: string[] = [];
    const subsetProvider: AnalyticsProvider<AppEvents> = {
      name: "orders-only",
      track: vi.fn((event) => {
        if (event.name === "order_created") handled.push(event.name);
      }),
    };
    const analytics = createAnalytics<AppEvents>({ providers: [{ provider: subsetProvider }] });

    analytics.track("user_registered", { userId: "1" });
    analytics.track("order_created", { orderId: "1", amount: 1 });
    analytics.track("logout");

    expect(subsetProvider.track).toHaveBeenCalledTimes(3);
    expect(handled).toEqual(["order_created"]);
  });
});
