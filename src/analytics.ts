import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsInstance,
  AnalyticsProvider,
  DefaultEvents,
  EventMap,
  EventValidator,
  TrackArgs,
  ValidationError,
  ValidationResult,
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
 * Calls a user-supplied report callback. Never throws: a failing callback
 * (sync throw, rejected promise, odd thenable) must not affect tracking.
 */
function notify<A>(callback: ((argument: A) => void) | undefined, argument: A): void {
  if (callback === undefined) return;
  try {
    // The callback is typed as returning void, but may be async at runtime.
    observe(callback(argument), noop);
  } catch {
    // Swallowed on purpose.
  }
}

/** What validation decided: dispatch this payload, or report this error. */
type Validation = { dispatch: true; payload: unknown } | { dispatch: false; error: ValidationError };

/** Runs the validator for one event. Never throws: a throwing validator fails closed. */
function validatePayload<
  T extends EventMap<T>,
  TInput extends EventMap<TInput>,
  K extends keyof T & keyof TInput & string,
>(validator: EventValidator<TInput, T>, name: K, payload: TInput[K]): Validation {
  try {
    const result: ValidationResult<T[K]> = validator.validate(name, payload);
    if (result.success) {
      return { dispatch: true, payload: result.data };
    }
    return { dispatch: false, error: { eventName: name, issues: result.issues } };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      dispatch: false,
      error: { eventName: name, issues: [{ message: `Validator threw: ${reason}`, path: [] }], cause },
    };
  }
}

/**
 * Creates an independent analytics instance. All state (providers, enabled
 * flags, `onError`, the validator) lives in this function's closure; nothing is
 * shared between instances and the returned methods do not use `this`.
 *
 * Without a `validator` the instance behaves exactly as it always has. With
 * one, every payload is validated before dispatch; see `EventValidator`.
 */
// The validator overload comes first on purpose. A validator that accepts a
// wider input than it produces (for example `number | string` in, `number` out)
// is also assignable to a validator of identical input and output; matching the
// plain overload first would silently narrow `track` to the output types.
export function createAnalytics<T extends EventMap<T>, TInput extends EventMap<TInput>>(
  config: AnalyticsConfig<T, TInput> & { validator: EventValidator<TInput, T> },
): AnalyticsInstance<T, TInput>;
export function createAnalytics<T extends EventMap<T> = DefaultEvents>(
  config: AnalyticsConfig<T>,
): AnalyticsInstance<T>;
export function createAnalytics<T extends EventMap<T>, TInput extends EventMap<TInput> = T>(
  config: AnalyticsConfig<T, TInput>,
): AnalyticsInstance<T, TInput> {
  // Snapshot of the configuration. `Map` keeps registration order and gives
  // lookup by name. Later changes to `config` or its entries are not seen.
  const providers = new Map<string, { provider: AnalyticsProvider<T>; enabled: boolean }>();
  const { onError, validator, onValidationError } = config;

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
    notify(onError, { providerName, eventName, error });
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

  function track<K extends keyof T & keyof TInput & string>(name: K, ...args: TrackArgs<TInput, K>): void {
    const [input] = args as unknown as readonly [TInput[K]];

    // Validation runs first. An invalid event is reported and goes nowhere.
    let payload: unknown = input;
    if (validator !== undefined) {
      const validation = validatePayload(validator, name, input);
      if (!validation.dispatch) {
        notify(onValidationError, validation.error);
        return;
      }
      payload = validation.payload;
    }

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
