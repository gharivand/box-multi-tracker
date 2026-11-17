import type { ProviderError, ValidationError } from "box-multi-tracker";

/**
 * A small in-memory log that the demo UI renders. Providers write to it so the
 * effect of each instance and each provider can be seen. It is not part of the
 * SDK and holds no SDK state.
 */
export type InstanceId = "application" | "commerce";

export type LogStatus = "delivered" | "provider-error" | "rejected";

export interface LogEntry {
  readonly id: number;
  readonly time: number;
  readonly instance: InstanceId;
  /** The provider involved; `null` when the event was rejected before any provider. */
  readonly provider: string | null;
  readonly eventName: string;
  readonly payload: string;
  readonly status: LogStatus;
  readonly detail: string;
}

export type NewLogEntry = Omit<LogEntry, "id" | "time">;

export interface EventLog {
  record(entry: NewLogEntry): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  getEntries(): readonly LogEntry[];
}

const MAX_ENTRIES = 200;

export function createEventLog(): EventLog {
  let entries: readonly LogEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    record(entry) {
      entries = [...entries, { ...entry, id: nextId++, time: Date.now() }].slice(-MAX_ENTRIES);
      emit();
    },
    clear() {
      entries = [];
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getEntries: () => entries,
  };
}

/** The log shown by the analytics panel. */
export const eventLog: EventLog = createEventLog();

export function formatPayload(payload: unknown): string {
  return payload === undefined ? "(no payload)" : JSON.stringify(payload);
}

/** `onError` of an instance: a provider threw or rejected. */
export function logProviderError(log: EventLog, instance: InstanceId, error: ProviderError): void {
  log.record({
    instance,
    provider: error.providerName,
    eventName: error.eventName,
    payload: "",
    status: "provider-error",
    detail: error.error instanceof Error ? error.error.message : String(error.error),
  });
}

/** `onValidationError` of an instance: the event was rejected before any provider. */
export function logValidationError(log: EventLog, instance: InstanceId, error: ValidationError): void {
  log.record({
    instance,
    provider: null,
    eventName: error.eventName,
    payload: "",
    status: "rejected",
    detail: error.issues
      .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
      .join("; "),
  });
}
