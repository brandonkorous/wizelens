// First import: lets WizeLens see every React render, including the first one.
import "@wizeworks/lens-react/install";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WizeLensProvider } from "@wizeworks/lens-react";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Every fetch gets a traceparent header, so the server trace links back to the click. */}
    {/* VITE_WIZELENS=1 keeps it on in a production build, to see minified stacks mapped back to the source. */}
    <WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV || import.meta.env.VITE_WIZELENS === "1"}>
      <App />
    </WizeLensProvider>
  </StrictMode>,
);
