# box-multi-tracker: Architecture

Status: design only (no implementation yet).
Scope: Senior Frontend take-home. The goal is a small, clean, well-tested core with a type-safe API, not a production analytics platform.

## 1. Summary

`box-multi-tracker` is a standalone, framework-agnostic TypeScript library with zero runtime dependencies. It does two things:

1. Defines the **provider contract** (`AnalyticsProvider`).
2. **Dispatches** each tracked event to every enabled provider, isolating failures.

Everything else lives outside Core:

- Vendor SDKs (GTM, Yandex Metrica, Mixpanel, ...).
- Vendor name and payload mapping.
- Provider configuration.
- Business event names and payload types.

**Pattern:** Facade (`Analytics`) + Strategy (`AnalyticsProvider`) with constructor Dependency Injection. Dispatch is a plain loop. No event bus, no registry, no singleton.

**30-second interview pitch:** "Core knows nothing about vendors. The app declares an event map, implements providers against that map, and injects them. `track()` loops over enabled providers and calls each inside an isolation wrapper that handles sync throws and async rejections. A failing provider can't affect the others or the app."

```mermaid
flowchart LR
  App[ConsumingApp] -->|"track(name, payload)"| Analytics
  Analytics -->|enabled| ProviderA
  Analytics -->|enabled| ProviderB
  Analytics -.->|disabled: skipped| ProviderC
  ProviderA -.->|"throw or reject"| Isolation[isolation wrapper]
  Isolation -->|ProviderError| OnError[optional onError]
  AppEvents[AppEvents map] -.generic.-> Analytics
  AppEvents -.generic.-> ProviderA
```

## 2. Responsibilities and boundaries

**Core owns**
- The `AnalyticsProvider` contract and event types.
- The `Analytics` class: `track`, provider enable/disable/query.
- Fan-out dispatch in registration order.
- Sync and async error isolation, plus the optional `onError` hook.

**Core does NOT own**
- Any vendor code or dependency.
- Event names or payload types (the app defines them).
- Name or payload mapping to vendors (inside each provider).
- Provider configuration (inside each provider's constructor).
- Browser, Node, or framework APIs. The `tsconfig` uses `lib: ["ES2022"]` without `DOM`, so accidental browser API use fails to compile. Tests run in the `node` environment.
- Init/lifecycle, buffering, retries, batching, timeouts, persistence. All out of scope for v1.

**Extensibility:** adding a provider means writing a class that implements `AnalyticsProvider` in the consuming app or a separate package, then adding it to `providers`. No Core change.

## 3. Provider contract

Minimal on purpose: a unique `name` and a `track` method that may be sync or async.

```ts
// illustrative, not implementation
type EventMap<T> = { [K in keyof T]: object | undefined };

// Readonly envelope; payload is shallow-readonly (Readonly<undefined> is just undefined)
type AnalyticsEvent<T extends EventMap<T>> = {
  [K in keyof T & string]: {
    readonly name: K;
    readonly payload: Readonly<T[K]>;
  };
}[keyof T & string];

interface AnalyticsProvider<T extends EventMap<T> = DefaultEvents> {
  readonly name: string;
  track(event: AnalyticsEvent<T>): void | Promise<void>;
}
```

**Decisions and why**
- **Single event object instead of `track(name, payload)`.** It is a discriminated union, so a typed provider can `switch (event.name)` and get a narrowed `payload` per case. The contract can also grow later without breaking providers. Alternative (positional generic method): simpler to read, but narrowing inside providers is awkward.
- **`name` is required and unique.** It is the key for runtime enable/disable and for error attribution. No other way to address a provider is needed.
- **No `init/identify/reset/flush/shutdown`.** None are required by the assignment. A provider that needs setup does it in its own constructor. Adding optional methods later is non-breaking.
- **No timestamp or id in the event.** Providers can add their own. Core stays free of clocks and ID generation.
- **Readonly event and payload.** `name` and `payload` are `readonly`, and the payload is `Readonly<...>` (shallow). A provider that tries to assign to them fails to compile. This is a type-level guard only; see 5.4.
- **`EventMap<T>` self-referential constraint.** This is the one non-obvious type trick. It lets plain `interface AppEvents` work, because interfaces do not satisfy `Record<string, ...>` index signatures. It is defined once and reused.
- **`DefaultEvents = Record<string, object | undefined>`.** It allows untyped usage, and a provider written for "any event" is assignable to a typed `Analytics<AppEvents>`.
- **Method syntax on the interface.** This keeps parameter bivariance-friendly assignability for generic providers.

## 4. Public API

```ts
// illustrative, not implementation
interface ProviderEntry<T extends EventMap<T>> {
  provider: AnalyticsProvider<T>;
  enabled?: boolean;                 // default true
}

interface AnalyticsConfig<T extends EventMap<T>> {
  providers: ReadonlyArray<ProviderEntry<T>>;
  onError?: (error: ProviderError) => void;
}

interface ProviderError {
  providerName: string;
  eventName: string;
  error: unknown;                    // whatever the provider threw or rejected with
}

class Analytics<T extends EventMap<T> = DefaultEvents> {
  constructor(config: AnalyticsConfig<T>);
  track<K extends keyof T & string>(name: K, ...args: TrackArgs<T, K>): void;
  enableProvider(name: string): void;
  disableProvider(name: string): void;
  isProviderEnabled(name: string): boolean;
}

// payload is required unless the event's payload type includes undefined
type TrackArgs<T, K extends keyof T> =
  undefined extends T[K] ? [payload?: T[K]] : [payload: T[K]];
```

**Usage (consuming app)**

```ts
interface AppEvents {
  order_created: { orderId: string; amount: number };
  logout: undefined;
}

const analytics = new Analytics<AppEvents>({
  providers: [
    { provider: new GtmProvider(gtmConfig) },
    { provider: new MixpanelProvider(token), enabled: false },
  ],
  onError: ({ providerName, eventName, error }) => report(providerName, eventName, error),
});

analytics.track("order_created", { orderId: "12345", amount: 250000 });
analytics.track("logout");
analytics.enableProvider("mixpanel");
```

**Compile-time guarantees**
- Unknown event names are rejected.
- Required payloads are enforced and wrong payload shapes are rejected.
- Payloadless events take no second argument. Optional-payload events (`T | undefined`) may omit it.
- A provider typed for a different event map cannot be injected. A generic (untyped) provider can.

**Exports from `index.ts`**
- Value: `Analytics`.
- Types: `AnalyticsProvider`, `AnalyticsEvent`, `AnalyticsConfig`, `ProviderEntry`, `ProviderError`, `EventMap`.
- Nothing else. `TrackArgs` and internals stay private.

**Improvements over the original conceptual example**
- The event map is an explicit generic (`new Analytics<AppEvents>`) because TypeScript cannot infer it from providers.
- `providers` entries are a single uniform shape, `{ provider, enabled? }`, so there are no bare-or-wrapped unions and no runtime type guards.

## 5. Behavior

### 5.1 `track` dispatch flow

1. Build the event `{ name, payload }`.
2. For each provider entry in registration order:
   - Skip if disabled.
   - Run the provider call as one guarded unit (see 5.3).
   - Any failure is reported to `onError` and dispatching continues.
3. Return `void`. Nothing is awaited and nothing is thrown.

The same event object is passed to every provider (no cloning).

```mermaid
sequenceDiagram
  participant App
  participant Analytics
  participant ProvA as ProviderA
  participant ProvB as ProviderB
  participant Hook as onError
  App->>Analytics: track(name, payload)
  Analytics->>ProvA: track(event)
  ProvA--xAnalytics: throws or rejects
  Analytics->>Hook: ProviderError (protected)
  Analytics->>ProvB: track(event)
  Analytics-->>App: void
```

### 5.2 Enable / disable
- The initial state comes from `ProviderEntry.enabled` (default `true`).
- `enableProvider` / `disableProvider` take effect on the next `track`.
- Events tracked while a provider is disabled are **dropped, not queued or replayed** (no buffering in v1, and it matches consent semantics).
- `isProviderEnabled(name)` returns the current state, and `false` for an unknown name.
- `enableProvider` / `disableProvider` with an unknown name **throw**. This is a programmer error, so it fails fast and catches typos.
- Duplicate provider names throw at construction. This is required for name-based control to be unambiguous.
- An empty `providers` array is valid, and `track` is a no-op.

### 5.3 Error isolation

Each provider call is one guarded unit with two parts, plus a guarded reporter. `track` itself is never `async` and never `await`s, so it stays `void`.

1. **Call and normalize, inside a `try/catch`.** The provider call and the conversion of its return value both run inside the same `try`:
   - The provider throws synchronously: caught and reported **synchronously**.
   - It returns a non-thenable (`undefined`, or any unexpected value from untyped JS): ignored.
   - It returns anything else: it is normalized with `Promise.resolve(result)`. Doing this inside the `try` matters, because inspecting an unusual object can itself throw (for example a throwing `then` or `constructor` getter on a custom thenable).
2. **Observe the normalized promise with a rejection handler.** This covers:
   - Native rejected promises.
   - Custom thenables whose `then` throws or calls its reject callback. `Promise.resolve` converts these into a rejection, which is reported.
   - Thenables that call back more than once: only the first settlement counts.
   - Thenables that never settle: never reported, and harmless because nothing waits on them.
3. **The reporter cannot throw.** Both the `try/catch` and the rejection handler call the same reporter. The reporter calls `onError` inside its own `try/catch`, so a synchronous throw is swallowed. If `onError` returns a thenable (for example a consumer passed an `async` function), that thenable is also observed and its rejection swallowed. Because the reporter never throws, the promise chain derived from a provider never rejects, so there is no unhandled rejection.

Result: a failure anywhere in a provider's call, its returned value, or the error hook cannot escape and cannot skip the next provider.

Other points:
- **Default (no `onError`):** failures are silently ignored. Core has no logger and uses no `console`, so it stays environment-neutral.
- **`ProviderError` carries `providerName`, `eventName`, `error`.** `error` is `unknown`, because providers may throw non-`Error` values. The event payload is deliberately omitted so PII isn't forwarded to error sinks.
- **Why not an `async` wrapper:** `async () => provider.track(e)` gives one code path, but sync errors would be reported a microtask late. Explicit `try/catch` keeps sync reporting deterministic and easy to test.

### 5.4 Event immutability
- The event and its payload are readonly at the type level (section 3). This is **shallow**: nested objects inside a payload are not protected by the type.
- **Contract: providers must not mutate the received event or its payload.** All providers receive the same object, so a mutation would be visible to every later provider.
- Core does **not** deep clone and does **not** deep freeze. Cloning costs per event per provider and relies on runtime-specific APIs. Freezing would change runtime behavior for the app's own payload objects. The type-level guard plus the documented contract is the deliberate trade-off.

### 5.5 Deliberate scope decisions and known trade-offs

**Excluded on purpose.** This is a take-home, and each of these needs product decisions that the assignment does not specify:
- **Buffering, queues and lazy init:** they need policies (size caps, overflow, ordering) and a provider lifecycle state machine. Providers that need setup do it in their own constructor and may buffer internally.
- **Retries and per-provider timeouts:** they need policy (which errors, how often, how long) and delivery guarantees. Failures are isolated and reported through `onError`, and the app or provider decides what to do.
- **Persistence, offline storage and batching:** these depend on a runtime (storage, network), which Core must not touch.
- **Lifecycle methods (`init/identify/reset/flush/shutdown`):** not required by the assignment.

**Known trade-offs (documented, not solved)**
- Async completion is not awaited, so there is no completion-order guarantee. Calls are issued in order.
- A hung async provider blocks nothing. A slow synchronous provider blocks the caller, which is the provider's responsibility.
- Events tracked while a provider is disabled are dropped, not replayed.
- A provider calling `analytics.track` from inside its own `track` can loop. This is unguarded and treated as a provider bug.

## 6. Project structure

```
box-multi-tracker/
  src/
    index.ts        # public exports only
    types.ts        # EventMap, AnalyticsEvent, AnalyticsProvider, config and error types
    analytics.ts    # Analytics class: provider state, track, enable/disable, error isolation
  test/
    analytics.test.ts   # runtime behavior
    types.test-d.ts     # compile-time behavior
    helpers.ts          # recording / throwing / rejecting test providers
  ARCHITECTURE.md
  README.md             # usage and a sample custom provider snippet
  package.json  tsconfig.json  (vitest config if needed)
```

**Why this small:**
- `types.ts` and `analytics.ts` separate the contract (what providers and apps import) from behavior.
- Error isolation is about 15 lines. A separate file or `ErrorHandler` class would be a layer without a reason, so it stays a private method.
- There is no `utils/`, `core/`, `providers/`, `internal/`, or `testing/` folder.
- Tooling: TypeScript, Vitest, `tsc` for the build, **ESM-only** output with an `exports` map and `types`.
- The sample custom provider is a snippet in `README.md`. Test helpers contain their own small providers; there is no `examples/` folder.

## 7. Testing strategy

**Runtime tests (`analytics.test.ts`, Vitest, `node` env)**
- Dispatch to multiple providers: all receive the event, in registration order.
- Event correctness: exact `name` and `payload` received; payloadless events deliver `undefined`.
- Enable/disable: disabled at construction, disable at runtime, re-enable, and `isProviderEnabled`.
- Unknown name: `enableProvider` / `disableProvider` throw; `isProviderEnabled` returns `false`.
- Duplicate provider names throw at construction.
- Empty `providers`: `track` doesn't throw and is a no-op.
- Sync failure: a provider throws, the others still receive the event, `track` doesn't throw, and `onError` gets `{ providerName, eventName, error }`.
- Async failure: a provider rejects, the others still receive the event, no unhandled rejection, and `onError` is called after the promise settles.
- Unusual thenables: a custom thenable whose `then` throws, one that rejects, one that settles multiple times, and one whose property access throws. All are isolated and reported at most once, with no unhandled rejection.
- Mixed sync and async providers, including a failing provider between two healthy ones.
- No `onError` configured: failures are silent and tracking continues.
- `onError` that throws, and `onError` that is an async function that rejects: neither breaks tracking or the remaining providers, and neither causes an unhandled rejection.
- A hung (never-resolving) async provider doesn't block other providers or `track`.
- Every provider receives the same event object (shared reference, no cloning).
- `track` returns `undefined` (void).

Unhandled rejections are verified by listening for the runtime's unhandled-rejection signal during the test and asserting none occurred.

**Type tests (`types.test-d.ts`, `expectTypeOf` / `@ts-expect-error`, run via Vitest typecheck).** The suite must explicitly cover these four areas:

1. **Interface-based event maps.**
   - `interface AppEvents {...}` (not just a `type` alias) is accepted by `Analytics<AppEvents>`.
   - Valid event name and payload compile.
   - Unknown event names are errors.
   - Missing or wrong payloads are errors.
2. **`undefined` payloads.**
   - A payloadless event (`logout: undefined`) is callable with no payload.
   - An optional-payload event (`T | undefined`) may omit the payload or pass it.
   - A payloadless event rejects a provided payload.
3. **Generic providers.**
   - An untyped provider (default `DefaultEvents`) is accepted by `Analytics<AppEvents>`.
   - A provider typed for a different event map is rejected.
   - A provider typed for `AppEvents` is accepted.
4. **Discriminated-union narrowing.**
   - Inside a typed provider, `switch (event.name)` narrows `event.payload` to the matching payload type per case.
   - An exhaustiveness check over event names compiles when all cases are handled.

Plus readonly checks: assigning to `event.name`, `event.payload`, or a top-level payload property inside a provider is a compile error.

**Explicitly not tested:** package-compatibility matrices, publish checks, and bundle-size budgets.

## 8. Requirement traceability (is anything unnecessary?)

- Central tracking API: `Analytics.track`.
- Multiple providers: `providers` array and the dispatch loop.
- Provider contract: `AnalyticsProvider`.
- Type-safe names and payloads: `EventMap`, `AnalyticsEvent`, `TrackArgs`.
- Constructor DI: `AnalyticsConfig.providers`.
- Enable/disable (config and runtime), and query: `ProviderEntry.enabled`, `enableProvider`, `disableProvider`, `isProviderEnabled`.
- Failure isolation, sync and async: private isolation logic in `analytics.ts`.
- Optional `onError`, which cannot break tracking: `onError` plus its wrapper.
- Sync and async providers: the `void | Promise<void>` return type.
- Unit and type tests: `test/`.

Duplicate-name validation exists only because name-based control requires uniqueness. Everything in Core maps to a stated requirement.

## 9. Final decisions

1. **Provider configuration shape:** `{ provider, enabled? }` entries, with `enabled` defaulting to `true`. One uniform shape, no runtime type guard.
2. **Unknown provider names:** `enableProvider` / `disableProvider` throw. `isProviderEnabled` returns `false`.
3. **Duplicate provider names:** throw at construction.
4. **Module format:** ESM-only, built with `tsc`.
5. **Sample provider:** a snippet in `README.md`; no `examples/` folder.
6. **`ProviderError`:** `{ providerName, eventName, error }`; no event payload.
7. **Event immutability:** readonly envelope and shallow-readonly payload at the type level; providers must not mutate; no deep clone and no deep freeze.
8. **Async isolation:** guarded call plus `Promise.resolve` normalization inside `try/catch`, rejection handler, and a reporter that cannot throw. `track(): void`.
9. **Scope:** no buffering, retries, persistence, batching, timeouts or lifecycle methods. These are deliberate scope decisions (5.5).
