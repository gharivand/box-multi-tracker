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

export interface AnalyticsConfig<T extends EventMap<T>> {
  providers: ReadonlyArray<ProviderEntry<T>>;
  onError?: (error: ProviderError) => void;
}

/** Reported to `onError`. Deliberately excludes the event payload. */
export interface ProviderError {
  providerName: string;
  eventName: string;
  /** Whatever the provider threw or rejected with. */
  error: unknown;
}

/** Payload is required unless the event's payload type includes `undefined`. */
export type TrackArgs<T, K extends keyof T> = undefined extends T[K]
  ? [payload?: T[K]]
  : [payload: T[K]];

/** Public API returned by `createAnalytics`. */
export interface AnalyticsInstance<T extends EventMap<T> = DefaultEvents> {
  track<K extends keyof T & string>(name: K, ...args: TrackArgs<T, K>): void;
  enableProvider(name: string): void;
  disableProvider(name: string): void;
  isProviderEnabled(name: string): boolean;
}
