# Architecture & Technical Decisions

This document records the key architectural and technical decisions behind `box-multi-tracker`.

Its purpose is not simply to describe what the project uses, but to explain why these decisions were made, which alternatives were considered, and what trade-offs were accepted.

These decisions reflect the current requirements and scope of the project. They may be revisited as the SDK evolves and new requirements emerge.

---

## 1. Factory Function Instead of a Class

**Decision:** The main SDK API uses a factory function: `createAnalytics(config)`.

**Context**

The SDK needs a simple and predictable way to create analytics instances. Each application or application module should be able to create an instance with its own configuration and internal state.

**Alternatives Considered**

- A class-based API using `new Analytics()`.
- A factory function that creates and returns a public API.

**Rationale**

A factory function allows the SDK to encapsulate instance-specific state using closures.

The consumer interacts only with the methods returned by the factory and does not need access to the internal implementation.

The current SDK does not require inheritance or class-based extension mechanisms. A factory-based design provides the required encapsulation without introducing unnecessary object-oriented structure.

**Trade-offs**

Benefits:

- Keeps internal state private.
- Provides a small and explicit public API.
- Makes independent instances straightforward to create.
- Encourages composition over inheritance.

Limitations:

- Does not provide class inheritance.
- Extending the public API requires updating the factory's returned interface.

---

## 2. Independent State Per Instance

**Decision:** Every call to `createAnalytics()` creates an independent analytics instance with its own state.

**Context**

An application may need multiple analytics instances with different configurations, providers, or provider states.

Shared global state could cause changes in one instance to affect another, creating unexpected behavior and coupling.

**Rationale**

Each instance manages its own configuration and provider state within its closure.

No global state is shared between instances.

This allows different parts of an application, or entirely separate applications, to use the SDK independently.

**Trade-offs**

Benefits:

- Prevents state interference between instances.
- Allows different provider configurations.
- Makes instances easier to test in isolation.
- Supports reuse across multiple applications.

Limitations:

- Each instance maintains its own state.
- Consumers are responsible for managing the lifecycle and references of the instances they create.

---

## 3. Provider-Based Architecture

**Decision:** Event delivery is delegated to independently injectable providers.

**Context**

The SDK should support sending events to different destinations without being coupled to a specific analytics service or backend implementation.

Adding a new destination should not require changes to the Core.

**Alternatives Considered**

- Implementing integrations directly inside the Core.
- Using independently implemented and injected providers.
- Supporting only one predefined provider.

**Rationale**

The Core depends only on the provider contract. It does not need to know how a provider communicates with its destination.

Consumers can register multiple providers when creating an analytics instance.

Every enabled provider receives each valid event. Providers operate independently and do not need to know about one another.

**Trade-offs**

Benefits:

- Keeps the Core independent of external services.
- Allows new integrations without modifying the Core.
- Supports multiple destinations simultaneously.
- Allows providers to be enabled or disabled independently.
- Enables consumers to implement custom providers.

Limitations:

- Provider implementations are responsible for their own delivery logic.
- Registration order determines dispatch order.
- Provider execution characteristics can affect runtime behavior.

---

## 4. Non-Blocking Event Dispatch

**Decision:** `track()` does not wait for provider operations to complete and returns `void`.

**Context**

Analytics should not make the application's primary execution flow dependent on external analytics services.

For example, tracking an event should not require waiting for an HTTP request to finish.

**Alternatives Considered**

- Waiting for all providers using `Promise.all`.
- Starting provider dispatch without waiting for completion.

**Rationale**

Analytics is generally a side effect and should not block the application's primary workflow.

The `track()` method initiates dispatch and returns immediately.

A synchronous exception or asynchronous rejection from one provider should not prevent other providers from receiving the event.

**Trade-offs**

Benefits:

- The application does not wait for provider responses.
- A provider failure does not prevent other providers from being invoked.
- Keeps the public `track()` API simple.

Limitations:

- Consumers cannot await successful delivery through `track()`.
- Synchronous provider work can still block JavaScript execution until it returns or reaches an asynchronous boundary.
- The current implementation does not guarantee delivery, retries, or event persistence.
- Events may remain unsent if the application closes before provider operations complete.

**When to Revisit**

If reliable delivery, background processing, retries, or high-volume event handling become core requirements, queueing and delivery mechanisms should be evaluated separately.

---

## 5. Validation Is Optional and Independent of the Core

**Decision:** Event validation is optional and provided through an independently injected validator contract.

**Context**

Different applications may have different validation requirements and may prefer different validation libraries.

Making the Core depend on a specific validation library would unnecessarily constrain consumers.

**Alternatives Considered**

- Implementing validation directly inside the Core.
- Adding a direct dependency on a library such as Zod.
- Defining a generic validator contract that consumers can implement.

**Rationale**

The Core only depends on the validator contract, not on the implementation details of a validation library.

Consumers can use Zod, another validation library, or a custom implementation.

Validation takes place before event dispatch. Invalid events are not delivered to providers.

The validator may also transform the payload. In that case, providers receive the validated and transformed event.

**Trade-offs**

Benefits:

- Keeps the Core independent of validation libraries.
- Allows consumers to choose their preferred validation solution.
- Supports payload transformation.
- Makes validation optional for applications that do not need it.

Limitations:

- Consumers are responsible for defining validation rules.
- The validator implementation must follow the expected contract.
- Validation adds execution cost to the `track()` path.

---

## 6. Optional Adapters Instead of Core Dependencies

**Decision:** Integrations such as Zod, Sentry, and Debug Logger are provided as separate adapters.

**Context**

Not every application using the SDK needs Zod, Sentry, or debugging utilities.

Including these integrations directly in the Core would introduce unnecessary dependencies for consumers who do not use them.

**Rationale**

Each adapter is exposed through a separate package entry point. Consumers install and import only the integrations they need.

The Core remains independent of these external tools.

**Trade-offs**

Benefits:

- Avoids unnecessary mandatory dependencies.
- Keeps the Core lightweight.
- Allows adapters to evolve independently.
- Makes it easier to introduce additional integrations.

Limitations:

- Consumers must install the dependencies required by each adapter.
- Adapter compatibility with external libraries must be maintained separately.

---

## 7. Separate Error Reporting Channels

**Decision:** Provider errors and validation errors are reported through separate callbacks.

**Context**

A provider delivery failure and an invalid event are different types of problems.

They have different origins and may require different monitoring or recovery strategies.

**Rationale**

The SDK provides `onError` for provider-related errors and `onValidationError` for validation-related errors.

This allows consumers to handle each category independently.

The Core also avoids directly calling `console.error`, `console.warn`, or any vendor-specific monitoring service.

Error reporting is delegated to the consumer.

**Trade-offs**

Benefits:

- Separates error responsibilities.
- Allows independent monitoring strategies.
- Keeps the Core independent of logging and monitoring tools.
- Gives consumers control over error handling.

Limitations:

- Consumers are responsible for configuring their error reporting behavior.
- Without the relevant callback, consumers will not receive error notifications through that callback.

---

## 8. Consumer-Defined Event Maps and Type Safety

**Decision:** Consumers define their event contracts through TypeScript Event Maps and Generics.

**Context**

Event names and payload structures vary between applications.

Defining a fixed set of events inside the Core would couple the SDK to a particular business domain.

On the other hand, accepting arbitrary event names and payloads would reduce type safety and increase the likelihood of development-time mistakes.

**Rationale**

Consumers define their own Event Map and provide it when creating an analytics instance.

The public `track()` API uses this type information to associate event names with their corresponding payloads.

This allows TypeScript to detect invalid event names and incompatible payload structures during development.

**Trade-offs**

Benefits:

- Keeps the Core independent of application-specific event definitions.
- Detects incorrect event names at development time.
- Enforces event-specific payload structures.
- Improves editor support and type inference.

Limitations:

- TypeScript checks do not validate data at runtime.
- Type safety does not replace runtime validation.
- Consumers are responsible for maintaining accurate event definitions.

---

## 9. No Built-in Queue, Retry, or Batching

**Decision:** The current SDK does not implement event queueing, retries, or batching.

**Context**

These capabilities can be useful in some scenarios, but they introduce additional complexity.

For example, a queue requires decisions about ordering, capacity, flushing, failure handling, and event removal.

Retry mechanisms require policies such as retry limits, delays, and determining which failures are recoverable.

**Rationale**

The current goal is to provide a lightweight and reusable layer for dispatching events to multiple providers.

Queueing, retry, and batching are not essential requirements for the current scope.

They can be implemented inside individual providers or introduced as separate layers when needed.

**Trade-offs**

Benefits:

- Keeps the Core simple.
- Avoids additional internal state and complexity.
- Allows each provider to define delivery behavior appropriate to its destination.
- Avoids imposing the same delivery strategy on every provider.

Limitations:

- The SDK does not guarantee event delivery during network failures.
- Failed deliveries are not automatically retried by the Core.
- High-volume event management is the responsibility of providers or higher-level components.

**When to Revisit**

If reliable delivery, offline support, batching, or retry policies become common requirements, these capabilities should be evaluated.

The first question should be whether they belong in the Core or should remain separate responsibilities.

---

## Summary

The architecture of `box-multi-tracker` is built around a few fundamental principles:

- **Simplicity:** The Core focuses on instance management and event dispatch.
- **Independence:** The Core does not depend on frameworks, vendors, or optional libraries.
- **Extensibility:** New integrations can be introduced through independent providers and adapters.
- **Type Safety:** Consumers define their own event contracts and benefit from compile-time checks.
- **Separation of Concerns:** Event validation, delivery, error reporting, and external integrations remain separate responsibilities.

The goal is to build a reusable analytics SDK, not an overly complex analytics platform that attempts to solve every possible delivery and monitoring requirement inside its Core.
