import type { Delivery } from "../../analytics/dispatch-log";
import { useEventLog } from "./event-log.hook";

function DeliveryLine({ delivery }: { delivery: Delivery }) {
  return (
    <li className={`delivery ${delivery.status}`}>
      <span className="position">{delivery.position}</span>
      <code>{delivery.providerName}</code>
      <span className="outcome">
        {delivery.status === "pending" && "pending…"}
        {delivery.status === "ok" && "success"}
        {delivery.status === "error" && `error: ${delivery.errorMessage ?? "unknown"}`}
      </span>
      {delivery.status === "error" && (
        <span className={delivery.reportedToOnError ? "badge on" : "badge off"}>
          {delivery.reportedToOnError ? "reported to onError" : "not reported"}
        </span>
      )}
    </li>
  );
}

export function EventLog() {
  const { entries, instanceLabel, clear } = useEventLog();

  return (
    <section className="card">
      <header className="card-header">
        <h2>Live event log</h2>
        <button type="button" onClick={clear} disabled={entries.length === 0}>
          Clear
        </button>
      </header>
      <p className="hint">
        Newest first. Providers are listed in the order the SDK invoked them; a failing provider never stops the ones after it.
      </p>

      {entries.length === 0 && <p className="empty">No events yet. Use the actions on the left.</p>}

      <ol className="log">
        {entries.map((entry) => (
          <li key={entry.id} className="log-entry">
            <div className="log-head">
              <span className="seq">#{entry.id}</span>
              <span className="badge instance">{instanceLabel(entry.instanceId)}</span>
              <strong>{entry.eventName}</strong>
            </div>
            <pre>{JSON.stringify(entry.payload ?? null, null, 2)}</pre>

            {entry.deliveries.length > 0 ? (
              <ul className="deliveries">
                {entry.deliveries.map((delivery) => (
                  <DeliveryLine key={delivery.position} delivery={delivery} />
                ))}
              </ul>
            ) : (
              <p className="warn-text">No enabled provider received this event; it was dropped.</p>
            )}

            {entry.skippedProviders.length > 0 && (
              <p className="hint">
                Skipped (disabled): {entry.skippedProviders.map((name) => `${name}`).join(", ")}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
