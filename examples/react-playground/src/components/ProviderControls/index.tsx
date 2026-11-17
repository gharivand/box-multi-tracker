import type { FailureMode } from "../../analytics/providers/flaky.provider";
import { useProviderControls } from "./provider-controls.hook";
import type { ProviderControlsProps } from "./provider-controls.types";

const FAILURE_LABELS: Record<FailureMode, string> = {
  none: "healthy",
  throw: "throws (sync)",
  reject: "rejects (async)",
};

export function ProviderControls({ instance, isActive, onSelect }: ProviderControlsProps) {
  const { rows, failureMode, notice, setEnabled, setFailureMode, tryUnknownProvider } = useProviderControls(instance);

  return (
    <section className={isActive ? "card active" : "card"}>
      <header className="card-header">
        <h2>{instance.label}</h2>
        <label className="check">
          <input type="radio" name="active-instance" checked={isActive} onChange={onSelect} />
          Send feature events here
        </label>
      </header>

      <div className="table-scroll">
        <table className="providers">
          <thead>
            <tr>
              <th>#</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Recv.</th>
              <th>Failed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>{row.position}</td>
                <td>
                  <code>{row.name}</code>
                  {row.canFail && (
                    <label className="field inline">
                      <select
                        aria-label="Simulated behavior"
                        value={failureMode}
                        onChange={(event) => setFailureMode(event.target.value as FailureMode)}
                      >
                        {Object.entries(FAILURE_LABELS).map(([mode, label]) => (
                          <option key={mode} value={mode}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </td>
                <td>
                  <span className={row.enabled ? "badge on" : "badge off"}>{row.enabled ? "enabled" : "disabled"}</span>
                </td>
                <td>{row.received}</td>
                <td>{row.failed}</td>
                <td>
                  <button type="button" onClick={() => setEnabled(row.name, !row.enabled)}>
                    {row.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="link" onClick={tryUnknownProvider}>
        Try enabling an unknown provider
      </button>
      {notice !== null && <p className="hint">{notice}</p>}
    </section>
  );
}
