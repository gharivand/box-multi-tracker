/**
 * Constraint for an application's event map: every event name maps to an
 * object payload, or `undefined` for payloadless events.
 *
 * Written as a self-referential mapped type so plain `interface` event maps
 * satisfy it (interfaces have no implicit index signature).
 */
export type EventMap<T> = { [K in keyof T]: object | undefined };

/** Untyped event map, used when no application event map is supplied. */
export type DefaultEvents = Record<string, object | undefined>;

/**
 * Event delivered to providers: a discriminated union over the event map,
 * so `switch (event.name)` narrows `event.payload`.
 * The event and its payload are readonly (shallow).
 */
export type AnalyticsEvent<T extends EventMap<T>> = {
  [K in keyof T & string]: {
    readonly name: K;
    readonly payload: Readonly<T[K]>;
  };
}[keyof T & string];

/** Contract implemented outside Core by every analytics provider. */
export interface AnalyticsProvider<T extends EventMap<T> = DefaultEvents> {
  /** Unique within one `createAnalytics` configuration. */
  readonly name: string;
  track(event: AnalyticsEvent<T>): void | Promise<void>;
}

export interface ProviderEntry<T extends EventMap<T>> {
  provider: AnalyticsProvider<T>;
  /** Defaults to `true`. */
  enabled?: boolean;
}

/**
 * Configuration of `createAnalytics`.
 *
 * - `T` is the event map providers receive (the validated, possibly transformed
 *   payloads).
 * - `TInput` is the event map `track` accepts. It only differs from `T` when a
 *   validator transforms payloads, and defaults to `T`.
 */
export interface AnalyticsConfig<T extends EventMap<T>, TInput extends EventMap<TInput> = T> {
  providers: ReadonlyArray<ProviderEntry<T>>;
  onError?: (error: ProviderError) => void;
  /**
   * Optional payload validation, run before dispatch. Without it, payloads are
   * dispatched unchanged. See `EventValidator`.
   */
  validator?: EventValidator<TInput, T>;
  /** Called when validation fails. Never used for provider failures (`onError`). */
  onValidationError?: (error: ValidationError) => void;
}

/** Reported to `onError`. Deliberately excludes the event payload. */
export interface ProviderError {
  providerName: string;
  eventName: string;
  /** Whatever the provider threw or rejected with. */
  error: unknown;
}

/** One reason a payload was rejected. Independent of any validation library. */
export interface ValidationIssue {
  readonly message: string;
  /** Location of the problem inside the payload; empty for the payload as a whole. */
  readonly path: ReadonlyArray<string | number>;
}

/** Outcome of validating one payload: the (possibly transformed) data, or the issues. */
export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: ReadonlyArray<ValidationIssue> };

/**
 * Contract between the Core and a validation library. Core knows only this
 * interface; an adapter for a specific validation library implements it.
 *
 * `TInput` maps event names to what callers pass to `track`; `T` maps the same
 * names to what the validator produces and providers receive. They differ when
 * the validator transforms payloads.
 *
 * Declared as a function-typed property (not a method) on purpose: parameter
 * checking is then strict, so a validator that does not cover every event of
 * the configured maps is rejected at compile time.
 */
export interface EventValidator<TInput extends EventMap<TInput>, T extends EventMap<T> = TInput> {
  readonly validate: <K extends keyof TInput & keyof T & string>(
    name: K,
    payload: TInput[K],
  ) => ValidationResult<T[K]>;
}

/**
 * Reported to `onValidationError`. Excludes the payload, like `ProviderError`.
 * The event was not dispatched to any provider.
 */
export interface ValidationError {
  eventName: string;
  issues: ReadonlyArray<ValidationIssue>;
  /** Only set when the validator itself threw (a bug in the validator). */
  cause?: unknown;
}

/** Payload is required unless the event's payload type includes `undefined`. */
export type TrackArgs<T, K extends keyof T> = undefined extends T[K]
  ? [payload?: T[K]]
  : [payload: T[K]];

/**
 * Public API returned by `createAnalytics`. `TInput` is the payload type
 * `track` accepts; it defaults to `T` (no transformation).
 */
export interface AnalyticsInstance<T extends EventMap<T> = DefaultEvents, TInput extends EventMap<TInput> = T> {
  track<K extends keyof T & keyof TInput & string>(name: K, ...args: TrackArgs<TInput, K>): void;
  enableProvider(name: string): void;
  disableProvider(name: string): void;
  isProviderEnabled(name: string): boolean;
}
