/** WizeLens Cloud. */
export const CLOUD_URL = "https://app.wizelens.com";

const BROWSER_PATH = /\/_wizelens\/b\/wl_bk_[A-Za-z0-9_-]+$/;

/** The `endpoint` for a site with no WizeLens server (a static site): its pages send straight to WizeLens Cloud with a public browser key (`wl_bk_…`). */
export function cloudEndpoint(key: string, cloudUrl: string = CLOUD_URL): string {
  return `${cloudUrl.replace(/\/+$/, "")}/_wizelens/b/${encodeURIComponent(key)}`;
}

/** True for a cloud browser-key endpoint. Posts there go as plain text, a simple request, so the browser makes no CORS check first. */
export const isCloudBrowserEndpoint = (endpoint: string): boolean => BROWSER_PATH.test(endpoint);
