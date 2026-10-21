import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import { App } from "./App";
import { provider } from "./data/provider";
import { startReleaseChecks } from "./data/release";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/nav.css";
import "./styles/ui.css";
import "./styles/trace.css";
import "./styles/pages/cloud.css";
import "./styles/pages/account.css";
import "./styles/pages/billing.css";
import "./styles/layout.css";

provider.start();
startReleaseChecks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
