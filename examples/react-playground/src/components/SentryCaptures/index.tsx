import type { CapturedSentryEvent } from "../../monitoring/sentry-capture-log";
import { useSentryCaptures } from "./sentry-captures.hook";

function CapturedEvent({ event }: { event: CapturedSentryEvent }) {
  const errorType = event.tags.error_type;

  return (
    <li className="log-entry">
      <div className="log-head">
        <span className="seq">#{event.id}</span>
        {event.tags.instance !== undefined && <span className="badge instance">instance {event.tags.instance}</span>}
        {errorType !== undefined && <span className="badge rejected">{errorType}</span>}
        <strong>{event.exceptionType}</strong>
      </div>
      <p className="hint">{event.message}</p>

      <p className="payload-label">Tags</p>
      <p className="tags">
        {Object.entries(event.tags).map(([key, value]) => (
          <code key={key} className="tag">
            {key}={value}
          </code>
        ))}
      </p>

      <p className="payload-label">Context added by the SDK adapter</p>
      <pre>{JSON.stringify(event.context ?? null, null, 2)}</pre>

      <details>
        <summary>Full event, exactly as Sentry would send it</summary>
        <pre>{event.serialized}</pre>
      </details>
    </li>
  );
}

export function SentryCaptures() {
  const { events, clear } = useSentryCaptures();

  return (
    <section className="card">
      <header className="card-header">
        <h2>Sentry captures</h2>
        <button type="button" onClick={clear} disabled={events.length === 0}>
          Clear
        </button>
      </header>
      <p className="hint">
        The app initializes Sentry with a dummy DSN and an <strong>in-memory transport</strong>: nothing is sent to any
        Sentry project. This list is every error event Sentry was asked to send, newest first.
      </p>

      {events.length === 0 && <p className="empty">Nothing captured yet. Use the Sentry actions on the left.</p>}

      <ol className="log">
        {events.map((event) => (
          <CapturedEvent key={event.id} event={event} />
        ))}
      </ol>
    </section>
  );
}
