// A framework-agnostic store of the events Sentry handed to its transport. It is
// how the playground shows what *would* be sent to Sentry. It knows nothing
// about React, and nothing about the SDK adapter.

/** The part of a Sentry envelope this store reads: items are `[header, payload]` pairs. */
export type RecordedEnvelope = readonly [unknown, ReadonlyArray<readonly [{ readonly type?: string }, unknown]>];

/** One error event, as Sentry would have sent it. */
export interface CapturedSentryEvent {
  /** Increasing sequence number. */
  readonly id: number;
  readonly exceptionType: string;
  readonly message: string;
  readonly level: string | undefined;
  readonly tags: Readonly<Record<string, string>>;
  /** The `box_multi_tracker` context added by the SDK adapter, if present. */
  readonly context: Readonly<Record<string, unknown>> | undefined;
  /** The complete event as JSON: exactly the data that would leave the browser. */
  readonly serialized: string;
}

export interface SentryCaptureLog {
  getSnapshot(): readonly CapturedSentryEvent[];
  subscribe(listener: () => void): () => void;
  clear(): void;
  /** Records every error event of an envelope (other items, such as sessions, are ignored). */
  record(envelope: RecordedEnvelope): void;
}

/** Whether `text` appears anywhere in what would be sent for this event. */
export function eventContains(event: CapturedSentryEvent, text: string): boolean {
  return event.serialized.includes(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringTags(value: unknown): Record<string, string> {
  const tags: Record<string, string> = {};
  if (isRecord(value)) {
    for (const [key, tag] of Object.entries(value)) {
      tags[key] = String(tag);
    }
  }
  return tags;
}

/** Reads the fields the playground displays from a Sentry event payload. */
function toCapturedEvent(id: number, payload: unknown): CapturedSentryEvent {
  const event = isRecord(payload) ? payload : {};
  const exception = isRecord(event.exception) && Array.isArray(event.exception.values) ? event.exception.values[0] : undefined;
  const contexts = isRecord(event.contexts) ? event.contexts : {};
  const context = contexts.box_multi_tracker;

  return {
    id,
    exceptionType: isRecord(exception) && typeof exception.type === "string" ? exception.type : "Error",
    message: isRecord(exception) && typeof exception.value === "string" ? exception.value : "(no message)",
    level: typeof event.level === "string" ? event.level : undefined,
    tags: stringTags(event.tags),
    context: isRecord(context) ? context : undefined,
    serialized: JSON.stringify(payload, null, 2),
  };
}

const MAX_EVENTS = 100;

export function createSentryCaptureLog(): SentryCaptureLog {
  let events: readonly CapturedSentryEvent[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  function emit(next: readonly CapturedSentryEvent[]): void {
    events = next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => events,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    clear() {
      emit([]);
    },

    record([, items]) {
      const captured = items.flatMap(([header, payload]) =>
        header.type === "event" ? [toCapturedEvent(nextId++, payload)] : [],
      );
      if (captured.length > 0) {
        emit([...events, ...captured]);
      }
    },
  };
}
