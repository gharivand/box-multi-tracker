import { useValidationDemo } from "./validation-demo.hook";

export function ValidationDemo() {
  const { scenarios, lastRunId, run } = useValidationDemo();

  return (
    <section className="card">
      <h2>Validation</h2>
      <p className="hint">
        Every event is validated by a Zod schema before any provider sees it. Valid payloads are transformed; invalid
        ones are rejected and reported through <code>onValidationError</code>.
      </p>

      {scenarios.map((scenario) => (
        <div key={scenario.id} className="scenario">
          <div className="row">
            <button type="button" onClick={() => run(scenario)}>
              {scenario.title}
            </button>
            <span className={scenario.outcome === "rejected" ? "badge rejected" : "badge on"}>
              {scenario.outcome === "rejected" ? "rejected" : "delivered, transformed"}
            </span>
            {lastRunId === scenario.id && <span className="hint">sent: see the event log</span>}
          </div>
          <p className="hint">{scenario.description}</p>
        </div>
      ))}
    </section>
  );
}
