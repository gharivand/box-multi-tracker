import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsInstance,
  AnalyticsProvider,
  DefaultEvents,
  EventMap,
  TrackArgs,
} from "./types.js";

const noop = (): void => {};

/**
 * Observes a value that may be a promise or thenable, so a rejection can never
 * go unhandled. Other values are ignored.
 *
 * `Promise.resolve` turns unusual thenables (throwing `then`, multiple
 * settlements, ...) into a normal promise. Inspecting an odd object can still
 * throw synchronously, so callers must invoke this inside a `try/catch`.
 */
function observe(value: unknown, onRejected: (error: unknown) => void): void {
  const objectLike =
    (typeof value === "object" && value !== null) || typeof value === "function";
  if (objectLike) {
    Promise.resolve(value).then(undefined, onRejected);
  }
}

/**
 * Creates an independent analytics instance. All state (providers, enabled
 * flags, `onError`) lives in this function's closure; nothing is shared
 * between instances and the returned methods do not use `this`.
 */
export function createAnalytics<T extends EventMap<T> = DefaultEvents>(
  config: AnalyticsConfig<T>,
): AnalyticsInstance<T> {
  // Snapshot of the configuration. `Map` keeps registration order and gives
  // lookup by name. Later changes to `config` or its entries are not seen.
  const providers = new Map<string, { provider: AnalyticsProvider<T>; enabled: boolean }>();
  const { onError } = config;

  for (const entry of config.providers) {
    const { provider, enabled = true } = entry;
    const name = provider.name;
    if (providers.has(name)) {
      throw new Error(`Duplicate analytics provider name: "${name}"`);
    }
    providers.set(name, { provider, enabled });
  }

  /** Never throws: a failing `onError` must not affect tracking. */
  function report(providerName: string, eventName: string, error: unknown): void {
    if (onError === undefined) return;
    try {
      // `onError` is typed as returning void, but may be async at runtime.
      observe(onError({ providerName, eventName, error }), noop);
    } catch {
      // Swallowed on purpose.
    }
  }

  function dispatch(
    providerName: string,
    provider: AnalyticsProvider<T>,
    event: AnalyticsEvent<T>,
    eventName: string,
  ): void {
    try {
      observe(provider.track(event), (error) => report(providerName, eventName, error));
    } catch (error) {
      report(providerName, eventName, error);
    }
  }

  function track<K extends keyof T & string>(name: K, ...args: TrackArgs<T, K>): void {
    const [payload] = args as readonly [unknown?];
    // One event object, shared by every provider (no cloning, no freezing).
    const event = { name, payload } as unknown as AnalyticsEvent<T>;
    // Snapshot the enabled providers first, so enable/disable calls made while
    // dispatching only affect later `track` calls.
    const targets = [...providers].filter(([, entry]) => entry.enabled);
    for (const [providerName, entry] of targets) {
      dispatch(providerName, entry.provider, event, name);
    }
  }

  function getEntry(name: string): { enabled: boolean } {
    const entry = providers.get(name);
    if (entry === undefined) {
      const known = [...providers.keys()].map((n) => `"${n}"`).join(", ") || "none";
      throw new Error(`Unknown analytics provider: "${name}". Registered providers: ${known}`);
    }
    return entry;
  }

  function enableProvider(name: string): void {
    getEntry(name).enabled = true;
  }

  function disableProvider(name: string): void {
    getEntry(name).enabled = false;
  }

  function isProviderEnabled(name: string): boolean {
    return providers.get(name)?.enabled ?? false;
  }

  return { track, enableProvider, disableProvider, isProviderEnabled };
}
