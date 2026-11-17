import type { AnalyticsEvent, AnalyticsProvider } from "../src/index.js";

// Shared event map for runtime tests.
export interface AppEvents {
  user_registered: { userId: string };
  order_created: { orderId: string; amount: number };
  logout: undefined;
}

export type AppEvent = AnalyticsEvent<AppEvents>;

export type RecordingProvider = AnalyticsProvider<AppEvents> & {
  readonly events: AppEvent[];
};

/** Records every event it receives; optionally appends its name to a shared log. */
export function recordingProvider(name: string, log?: string[]): RecordingProvider {
  const events: AppEvent[] = [];
  return {
    name,
    events,
    track(event) {
      events.push(event);
      log?.push(name);
    },
  };
}

/** Throws synchronously from `track`. */
export function throwingProvider(name: string, error: unknown): AnalyticsProvider<AppEvents> {
  return {
    name,
    track() {
      throw error;
    },
  };
}

/** Returns a promise that rejects with `error`. */
export function rejectingProvider(name: string, error: unknown): AnalyticsProvider<AppEvents> {
  return {
    name,
    track() {
      return Promise.reject(error);
    },
  };
}

/** Returns a promise that never settles. */
export function neverSettlingProvider(name: string): AnalyticsProvider<AppEvents> {
  return {
    name,
    track() {
      return new Promise<void>(() => {});
    },
  };
}

/** Returns an arbitrary value from `track`, for testing unusual thenables. */
export function providerReturning(name: string, value: unknown): AnalyticsProvider<AppEvents> {
  return {
    name,
    track() {
      return value as Promise<void>;
    },
  };
}

export function deferred<V>(): { promise: Promise<V>; resolve: (value: V) => void } {
  let resolve!: (value: V) => void;
  const promise = new Promise<V>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The tsconfig deliberately loads no Node/DOM types (Core must not depend on
// them), so the few runtime globals the tests need are declared here.
interface TestGlobals {
  process: {
    on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
    off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  };
  setImmediate(callback: () => void): void;
  console: Record<"log" | "info" | "warn" | "error" | "debug" | "trace", (...args: unknown[]) => void>;
}

export const testGlobals = globalThis as unknown as TestGlobals;

/** Lets pending microtasks and the runtime's unhandled-rejection check run. */
export function nextTurn(): Promise<void> {
  return new Promise((resolve) => testGlobals.setImmediate(resolve));
}

/** Runs `action`, then returns every promise rejection that went unhandled. */
export async function collectUnhandledRejections(action: () => void): Promise<unknown[]> {
  const reasons: unknown[] = [];
  const listener = (reason: unknown): void => {
    reasons.push(reason);
  };
  testGlobals.process.on("unhandledRejection", listener);
  try {
    action();
    await nextTurn();
    await nextTurn();
  } finally {
    testGlobals.process.off("unhandledRejection", listener);
  }
  return reasons;
}
