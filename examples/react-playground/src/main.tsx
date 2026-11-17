import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createSentryCaptureLog } from "./monitoring/sentry-capture-log";
import { initSentry } from "./monitoring/sentry";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element");
}

// Sentry belongs to the application: initialized here, once, before anything is tracked.
const sentryLog = createSentryCaptureLog();
initSentry(sentryLog);

createRoot(container).render(
  <StrictMode>
    <App sentryLog={sentryLog} />
  </StrictMode>,
);
