import { describe, expect, it, vi } from "vitest";
import { createSentryCaptureLog, eventContains } from "./sentry-capture-log";
import type { RecordedEnvelope } from "./sentry-capture-log";

const errorEnvelope = (payload: unknown): RecordedEnvelope => [{}, [[{ type: "event" }, payload]]];

describe("createSentryCaptureLog", () => {
  it("records the error events of an envelope with their tags and adapter context", () => {
    const log = createSentryCaptureLog();

    log.record(
      errorEnvelope({
        level: "error",
        exception: { values: [{ type: "Error", value: "boom" }] },
        tags: { source: "box-multi-tracker", provider: "p", attempts: 2 },
        contexts: { box_multi_tracker: { thrown_value_was_error: true } },
      }),
    );

    const [event] = log.getSnapshot();
    expect(event).toMatchObject({
      id: 1,
      exceptionType: "Error",
      message: "boom",
      level: "error",
      tags: { source: "box-multi-tracker", provider: "p", attempts: "2" },
      context: { thrown_value_was_error: true },
    });
    expect(JSON.parse(event?.serialized ?? "null")).toMatchObject({ level: "error" });
  });

  it("ignores items that are not error events, such as sessions", () => {
    const log = createSentryCaptureLog();

    log.record([{}, [[{ type: "session" }, { status: "ok" }]]]);

    expect(log.getSnapshot()).toEqual([]);
  });

  it("copes with an event that lacks the usual fields", () => {
    const log = createSentryCaptureLog();

    log.record(errorEnvelope({}));
    log.record(errorEnvelope(null));

    expect(log.getSnapshot().map((event) => event.message)).toEqual(["(no message)", "(no message)"]);
    expect(log.getSnapshot()[0]?.context).toBeUndefined();
  });

  it("gives events increasing ids and notifies subscribers, until they unsubscribe", () => {
    const log = createSentryCaptureLog();
    const listener = vi.fn();
    const unsubscribe = log.subscribe(listener);

    log.record(errorEnvelope({}));
    log.record(errorEnvelope({}));
    unsubscribe();
    log.record(errorEnvelope({}));

    expect(log.getSnapshot().map((event) => event.id)).toEqual([1, 2, 3]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears, and keeps numbering", () => {
    const log = createSentryCaptureLog();
    log.record(errorEnvelope({}));

    log.clear();
    log.record(errorEnvelope({}));

    expect(log.getSnapshot().map((event) => event.id)).toEqual([2]);
  });

  it("keeps only the newest 100 events", () => {
    const log = createSentryCaptureLog();

    for (let index = 0; index < 120; index++) log.record(errorEnvelope({}));

    expect(log.getSnapshot()).toHaveLength(100);
    expect(log.getSnapshot()[0]?.id).toBe(21);
  });
});

describe("eventContains", () => {
  it("finds text anywhere in the serialized event", () => {
    const log = createSentryCaptureLog();
    log.record(errorEnvelope({ exception: { values: [{ value: "deep" }] }, extra: { nested: { text: "needle" } } }));

    const [event] = log.getSnapshot();
    expect(event && eventContains(event, "needle")).toBe(true);
    expect(event && eventContains(event, "haystack")).toBe(false);
  });
});
