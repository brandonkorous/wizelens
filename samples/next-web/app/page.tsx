"use client";
import { checkout } from "../lib/coupon";

export default function Home() {
  return (
    <main>
      <h1>WizeLens Next.js sample</h1>
      <p>
        Throw an error in the browser, then open the <a href="/_wizelens/#/errors">dashboard</a>. In a production build the
        stack is minified; source maps show where it came from.
      </p>
      <button type="button" onClick={() => checkout("")}>
        Throw a browser error
      </button>
    </main>
  );
}
