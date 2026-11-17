# react-playground: React + Vite consumer

A realistic frontend consumer of `box-multi-tracker`, built with Vite, React and TypeScript. It is a playground for the SDK and a permanent boundary test: it installs the SDK from a **packed tarball** (the artifact an npm consumer receives) and imports it only as `box-multi-tracker`. It never touches SDK source.

## What it demonstrates

- Two independent analytics instances with different provider order and initial state.
- Three providers: `console` (sync), `mock-analytics` (async), and `flaky-service` (fails on demand: sync throw or async rejection).
- Enable and disable per provider (the real `enableProvider` / `disableProvider` / `isProviderEnabled`), taking effect on the next `track` call.
- Provider failure isolation, reported through the configured `onError`.
- Unknown provider behavior (`enableProvider("does-not-exist")` throws, `isProviderEnabled` returns `false`).
- A live event log: event, payload, global order, each provider in invocation order with its outcome, skipped (disabled) providers, and dropped events.

## Install and run

The repository's own dependencies must be installed first (`npm install` in the repository root).

```bash
cd examples/react-playground
npm run setup     # build SDK -> npm pack -> install tarball + app dependencies
npm run dev       # start Vite
npm test          # unit tests of the app's analytics layer (Vitest)
npm run verify    # typecheck app + public API (NodeNext & Bundler) + tests + production build
```

`setup` runs `scripts/setup.mjs`, which builds the SDK, runs `npm pack` into `.sdk/` (git-ignored), checks the tarball contains only `dist/`, `package.json` and `README.md`, and runs `npm install`. `package.json` points at it with `"box-multi-tracker": "file:.sdk/box-multi-tracker.tgz"`. Re-run `npm run setup` after changing the SDK.

## Structure

```text
src/
  app/                       composition: App, PlaygroundProvider, context, hooks
  analytics/                 the application's analytics layer
    events.ts                AppEvents: the typed event map (owned by the app)
    analytics.ts             composition root: builds providers, calls createAnalytics<AppEvents>()
    tracking.ts              semantic tracking API used by features
    providers/               console, mock-analytics, flaky (test double)
    observed-provider.ts     decorator recording provider calls for the log (demo only)
    dispatch-log.ts          framework-agnostic store behind the event log (demo only)
  domain/catalog.ts          fake storefront data
  features/<area>/<feature>/ index.tsx (UI), <feature>.hook.ts (logic), <feature>.types.ts, plain services
  components/                ProviderControls, EventLog
type-checks/                 public-API type checks, run under NodeNext and Bundler
```

## Conventions

- Components render and forward interactions; feature hooks own state and orchestration; business logic lives in plain TypeScript services.
- Features depend on the `Tracking` abstraction (narrowed per feature with `Pick`), never on the SDK or a provider.
- The event is tracked only at the semantic point where it is true: after a successful login, after the product has loaded, after the order was created. Failures track nothing.
- `type-checks/public-api.ts` is a self-contained consumer check (valid and invalid events and payloads, narrowing, public type imports, inaccessible internals). It is separate from the app because NodeNext needs `.js` import extensions, which a Vite app does not use.
