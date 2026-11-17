import { useAnalyticsPanel } from "./analytics-panel.hook";
import type { LogRowView } from "./analytics-panel.types";

function LogRow({ entry }: { entry: LogRowView }) {
  return (
    <li className={`log-entry log-${entry.status}`}>
      <div className="log-head">
        <span className="muted">#{entry.id}</span>
        <span className="muted">{entry.timeLabel}</span>
        <span className={`badge badge-${entry.instance}`}>{entry.instance}</span>
        <code>{entry.provider ?? "no provider"}</code>
        <strong>{entry.eventName}</strong>
        {entry.status === "provider-error" && <span className="status status-error">provider error</span>}
        {entry.status === "rejected" && <span className="status status-error">rejected</span>}
      </div>
      {entry.payload !== "" && <code className="log-payload">{entry.payload}</code>}
      <div className="log-detail">{entry.detail}</div>
    </li>
  );
}

export function AnalyticsPanel() {
  const { sections, rows, backendFailing, setBackendFailing, sendInvalidEvent, clearLog } = useAnalyticsPanel();

  return (
    <aside className="panel" aria-label="Analytics panel">
      <h2>Analytics panel</h2>
      <p className="muted">
        Two independent SDK instances. Disable a provider in one and use the shop: the other instance is not affected.
      </p>

      {sections.map(({ instance, title, providers }) => (
        <section key={instance} className="panel-section">
          <h3>
            <span className={`badge badge-${instance}`}>{instance}</span> {title}
          </h3>
          <ul className="provider-list">
            {providers.map(({ name, enabled, toggle }) => (
              <li key={name}>
                <code>{name}</code>
                <span className={enabled ? "status status-on" : "status status-off"}>
                  {enabled ? "enabled" : "disabled"}
                </span>
                <button type="button" className="button button-small" onClick={toggle}>
                  {enabled ? "Disable" : "Enable"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="panel-section">
        <h3>Try it</h3>
        <label className="check">
          <input type="checkbox" checked={backendFailing} onChange={(event) => setBackendFailing(event.target.checked)} />
          Simulate a <code>backendProvider</code> outage
        </label>
        <button type="button" className="button button-small" onClick={sendInvalidEvent}>
          Send an invalid commerce event
        </button>
        <p className="muted">
          The outage is reported to <code>onError</code> while <code>commerceLogProvider</code> keeps working. The
          invalid event (quantity 0) is rejected by the Zod validator before any provider is called.
        </p>
      </section>

      <section className="panel-section">
        <div className="panel-title-row">
          <h3>Event log (newest first)</h3>
          <button type="button" className="button button-small" onClick={clearLog}>
            Clear
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="muted">Nothing recorded yet. Open a product or add something to the cart.</p>
        ) : (
          <ul className="log">
            {rows.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
