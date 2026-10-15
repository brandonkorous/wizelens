import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WizeLensProvider } from "@wizeworks/lens-react";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Every fetch gets a traceparent header, so the server trace links back to the click. */}
    <WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV}>
      <App />
    </WizeLensProvider>
  </StrictMode>,
);
