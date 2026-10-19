// A bug on purpose: an empty coupon code throws in the browser. WizeLens maps the minified stack back here.
export function applyCoupon(code: string): string {
  if (!code.trim()) {
    throw new Error("Coupon code is empty");
  }
  return code.toUpperCase();
}

export function checkout(code: string): string {
  return `Applied ${applyCoupon(code)}`;
}
