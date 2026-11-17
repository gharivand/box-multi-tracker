import type { ProviderError, ValidationError, ValidationIssue } from "box-multi-tracker";

// A framework-agnostic store describing what happened to each tracked event.
// It exists to make the SDK's dispatch behavior visible in the playground; the
// SDK itself knows nothing about it.

export type DeliveryStatus = "pending" | "ok" | "error";

/** One provider invocation for one tracked event. */
export interface Delivery {
  readonly providerName: string;
  /** 1-based position in the order providers were invoked. */
  readonly position: number;
  /** The payload this provider received (after validation and transformation). */
  readonly receivedPayload: unknown;
  readonly status: DeliveryStatus;
  readonly errorMessage?: string;
  /** True once the SDK reported this failure through `onError`. */
  readonly reportedToOnError: boolean;
}

/** One `track` call. */
export interface DispatchEntry {
  /** Global, increasing sequence number across all instances. */
  readonly id: number;
  readonly instanceId: string;
  readonly eventName: string;
  /** The payload as it was passed to `track`, before validation. */
  readonly payload: unknown;
  /**
   * Set when validation rejected the event (reported through
   * `onValidationError`). A rejected event has no deliveries.
   */
  readonly validationIssues?: readonly ValidationIssue[];
  /** Providers that were disabled when the event was tracked, so it skipped them. */
  readonly skippedProviders: readonly string[];
  readonly deliveries: readonly Delivery[];
}

export interface DeliveryHandle {
  succeed(): void;
  fail(error: unknown): void;
}

export interface DispatchLog {
  getSnapshot(): readonly DispatchEntry[];
  subscribe(listener: () => void): () => void;
  clear(): void;
  /** Records a `track` call: everything recorded while `send` runs belongs to it. */
  runDispatch(
    instanceId: string,
    eventName: string,
    payload: unknown,
    skippedProviders: readonly string[],
    send: () => void,
  ): void;
  /** Records that a provider was invoked. Returns a handle to record its outcome. */
  recordDelivery(instanceId: string, providerName: string, event: { name: string; payload: unknown }): DeliveryHandle;
  /** Records an `onError` report from the SDK (a provider failed). */
  reportError(instanceId: string, error: ProviderError): void;
  /** Records an `onValidationError` report from the SDK (validation rejected the event). */
  reportValidationError(instanceId: string, error: ValidationError): void;
}

const MAX_ENTRIES = 200;

export interface DeliveryCounts {
  received: number;
  failed: number;
}

/** How many events a provider of an instance received, and how many deliveries failed. */
export function countDeliveries(
  entries: readonly DispatchEntry[],
  instanceId: string,
  providerName: string,
): DeliveryCounts {
  const counts: DeliveryCounts = { received: 0, failed: 0 };
  for (const entry of entries) {
    if (entry.instanceId !== instanceId) continue;
    for (const delivery of entry.deliveries) {
      if (delivery.providerName !== providerName) continue;
      counts.received += 1;
      if (delivery.status === "error") counts.failed += 1;
    }
  }
  return counts;
}

/**
 * Whether the payload a provider received equals the payload that was tracked.
 * Compared structurally, so a transformation (for example `"500"` to `500`)
 * shows up as a difference.
 */
export function samePayload(tracked: unknown, received: unknown): boolean {
  return JSON.stringify(tracked ?? null) === JSON.stringify(received ?? null);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDispatchLog(): DispatchLog {
  let entries: readonly DispatchEntry[] = [];
  let nextId = 1;
  /** Entry currently being dispatched, per instance (dispatch is synchronous). */
  const open = new Map<string, number>();
  const listeners = new Set<() => void>();

  function emit(next: readonly DispatchEntry[]): void {
    entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    listeners.forEach((listener) => listener());
  }

  function updateEntry(id: number, update: (entry: DispatchEntry) => DispatchEntry): void {
    emit(entries.map((entry) => (entry.id === id ? update(entry) : entry)));
  }

  function updateDelivery(entryId: number, position: number, update: (delivery: Delivery) => Delivery): void {
    updateEntry(entryId, (entry) => ({
      ...entry,
      deliveries: entry.deliveries.map((delivery) => (delivery.position === position ? update(delivery) : delivery)),
    }));
  }

  function createEntry(
    instanceId: string,
    eventName: string,
    payload: unknown,
    skippedProviders: readonly string[],
  ): DispatchEntry {
    const entry: DispatchEntry = { id: nextId++, instanceId, eventName, payload, skippedProviders, deliveries: [] };
    emit([...entries, entry]);
    return entry;
  }

  return {
    getSnapshot: () => entries,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    clear() {
      emit([]);
    },

    runDispatch(instanceId, eventName, payload, skippedProviders, send) {
      const entry = createEntry(instanceId, eventName, payload, skippedProviders);
      open.set(instanceId, entry.id);
      try {
        send();
      } finally {
        open.delete(instanceId);
      }
    },

    recordDelivery(instanceId, providerName, event) {
      // A provider invoked outside `runDispatch` (a direct SDK call) still gets logged.
      const entryId = open.get(instanceId) ?? createEntry(instanceId, event.name, event.payload, []).id;
      const entry = entries.find((candidate) => candidate.id === entryId);
      const position = (entry?.deliveries.length ?? 0) + 1;
      updateEntry(entryId, (current) => ({
        ...current,
        deliveries: [
          ...current.deliveries,
          { providerName, position, receivedPayload: event.payload, status: "pending", reportedToOnError: false },
        ],
      }));

      return {
        succeed: () => updateDelivery(entryId, position, (delivery) => ({ ...delivery, status: "ok" })),
        fail: (error) =>
          updateDelivery(entryId, position, (delivery) => ({
            ...delivery,
            status: "error",
            errorMessage: errorMessage(error),
          })),
      };
    },

    reportValidationError(instanceId, error) {
      // Validation runs synchronously inside `track`, so the open entry is the rejected event.
      const entryId = open.get(instanceId) ?? createEntry(instanceId, error.eventName, undefined, []).id;
      updateEntry(entryId, (current) => ({ ...current, validationIssues: error.issues }));
    },

    reportError(instanceId, error) {
      // Find the newest failed, not-yet-reported delivery that matches the report.
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (entry === undefined || entry.instanceId !== instanceId || entry.eventName !== error.eventName) continue;
        const delivery = entry.deliveries.find(
          (candidate) =>
            candidate.providerName === error.providerName &&
            candidate.status === "error" &&
            !candidate.reportedToOnError,
        );
        if (delivery !== undefined) {
          updateDelivery(entry.id, delivery.position, (current) => ({ ...current, reportedToOnError: true }));
          return;
        }
      }
    },
  };
}
