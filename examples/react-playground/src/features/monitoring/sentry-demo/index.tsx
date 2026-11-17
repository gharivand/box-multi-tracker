import { useSentryDemo } from "./sentry-demo.hook";

export function SentryDemo() {
  const { scenarios, lastRun, notice, capturedSinceRun, privateText, privateTextMatches, run } = useSentryDemo();

  return (
    <section className="card">
      <h2>Sentry</h2>
      <p className="hint">
        The app connects <code>createSentryReporter</code> to <code>onError</code> and <code>onValidationError</code>.
        Provider errors and validator exceptions are reported; ordinary validation failures are not; analytics payloads
        never are. Results appear in <strong>Sentry captures</strong> (local, in-memory: nothing is sent).
      </p>

      {scenarios.map((scenario) => (
        <div key={scenario.id} className="scenario">
          <div className="row">
            <button type="button" onClick={() => run(scenario)}>
              {scenario.title}
            </button>
            <span className={scenario.expectation === "reported" ? "badge on" : "badge off"}>
              {scenario.expectation === "reported" ? "reported to Sentry" : "not reported"}
            </span>
          </div>
          <p className="hint">{scenario.description}</p>

          {lastRun?.scenario.id === scenario.id && (
            <p className="hint">
              Sent to {lastRun.instanceLabel}. Sentry events captured since: <strong>{capturedSinceRun}</strong>{" "}
              (expected {scenario.expectation === "reported" ? "at least 1" : "0"}).
              {privateText !== undefined && privateTextMatches !== null && (
                <>
                  {" "}
                  <code>{privateText}</code> found in <strong>{privateTextMatches}</strong> captured events (expected 0).
                </>
              )}
            </p>
          )}
        </div>
      ))}

      {notice !== null && <p className="warn-text">{notice}</p>}
    </section>
  );
}
