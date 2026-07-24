/**
 * Turn a raw Razorpay / network error into something a person can act on.
 *
 * The SDK's `description` / `message` (e.g. "BAD_REQUEST_ERROR", a gateway
 * code, or a JS stack) used to be piped straight into an Alert, which reads as
 * gibberish to a driver. Keep that detail in console.warn for debugging and
 * show plain language here.
 *
 * IMPORTANT: every branch asserts "you have not been charged", so only call
 * this when the payment genuinely did NOT complete. If Razorpay captured the
 * money and only server-side verification failed, say something else — the
 * amount may really have left their account.
 */
export function friendlyPaymentError(err: any): string {
  const raw = `${err?.description ?? ''} ${err?.message ?? ''}`.toLowerCase();

  if (/network|internet|timed ?out|timeout|connection|unreachable|offline/.test(raw)) {
    return "We couldn't reach the payment service. Check your internet connection and try again — you have not been charged.";
  }
  if (/insufficient|low balance/.test(raw)) {
    return 'The payment was declined for insufficient funds. Try another card or payment method — you have not been charged.';
  }
  if (/declin|refus|blocked|not permitted|restricted|fraud/.test(raw)) {
    return 'Your bank declined this payment. Try a different card or payment method — you have not been charged.';
  }
  if (/expired|invalid card|incorrect|cvv|card number/.test(raw)) {
    return "Those card details couldn't be accepted. Please check them and try again — you have not been charged.";
  }
  if (/authenticat|otp|3ds|password/.test(raw)) {
    return 'Payment authentication failed. Please try again and complete your bank verification step — you have not been charged.';
  }
  return "Your payment didn't go through. Please try again, or use a different payment method — you have not been charged.";
}

export default friendlyPaymentError;
