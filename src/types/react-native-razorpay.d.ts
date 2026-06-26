// Minimal type declaration for react-native-razorpay (ships no types).
// Covers the small surface the app uses: RazorpayCheckout.open(options).
declare module 'react-native-razorpay' {
  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  const RazorpayCheckout: {
    open(options: Record<string, any>): Promise<RazorpaySuccessResponse>;
  };

  export default RazorpayCheckout;
}
