import api from './api';

export interface WalletInfo {
  balance: number;
  currency: string;
}

export interface PaymentRecord {
  _id: string;
  amount: number;
  type: 'ride_payment' | 'wallet_topup' | 'tip' | 'refund' | 'subscription' | 'cancellation_fee';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  method: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  description: string;
  createdAt: string;
}

export interface SavedMethod {
  _id: string;
  type: 'credit_card' | 'debit_card' | 'upi' | 'wallet';
  brand?: string;
  last4?: string;
  cardHolderName?: string;
  expiryMonth?: number;
  expiryYear?: number;
  upiId?: string;
  walletProvider?: string;
  walletEmail?: string;
  label: string;
  isDefault: boolean;
}

export interface CreateOrderPayload {
  amount: number;
  type?: 'wallet_topup' | 'ride_payment' | 'scheduled_booking';
  rideId?: string;
  /** Scheduled-shuttle booking — tags the Razorpay order with the route
   *  for reconciliation. The actual seat reservation happens client-side
   *  after verifyPayment succeeds. */
  scheduledRouteId?: string;
  methodPreference?: 'card' | 'upi' | 'wallet';
  /** Wallet top-up via an admin-defined recharge offer. When set, the server
   *  computes the charge + credit from the offer and ignores `amount`. */
  offerId?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  data: {
    orderId: string;
    amount: number;
    currency: string;
    paymentId: string;
    keyId: string;
    /** Server-computed top-up breakdown (wallet_topup only). */
    chargeAmount?: number;
    walletCredit?: number;
    bonusAmount?: number;
  };
}

export interface RechargeOffer {
  _id: string;
  amount: number;
  bonusAmount: number;
  discountPercent: number;
  label: string;
  isPopular: boolean;
  /** Computed by the server. */
  denomination: number;
  bonus: number;
  discount: number;
  gst: number;
  total: number;
  walletCredit: number;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface AddMethodPayload {
  type: 'credit_card' | 'debit_card' | 'upi' | 'wallet';
  brand?: string;
  last4?: string;
  cardHolderName?: string;
  expiryMonth?: number;
  expiryYear?: number;
  upiId?: string;
  walletProvider?: string;
  walletEmail?: string;
  label: string;
  isDefault?: boolean;
}

export const paymentService = {
  // Orders & Payments
  createOrder: async (payload: CreateOrderPayload): Promise<CreateOrderResponse> => {
    const { data } = await api.post<CreateOrderResponse>('/payments/create-order', payload);
    return data;
  },

  verifyPayment: async (payload: VerifyPaymentPayload) => {
    const { data } = await api.post('/payments/verify-payment', payload);
    return data;
  },

  // Wallet
  getWallet: async () => {
    const { data } = await api.get('/payments/wallet');
    return data;
  },

  /**
   * Paginated wallet/transaction statement (newest first). Mirrors the
   * backend GET /payments/wallet/statement: { items, pagination }.
   */
  getWalletStatement: async (page = 1, limit = 10) => {
    const { data } = await api.get('/payments/wallet/statement', {
      params: { page, limit },
    });
    return data;
  },

  // Recharge offers (admin-defined denominations with bonus/discount)
  getRechargeOffers: async (): Promise<{ success: boolean; data: { offers: RechargeOffer[] } }> => {
    const { data } = await api.get('/payments/recharge-offers');
    return data;
  },

  /**
   * Debit the rider's wallet to pay for a completed ride. Throws if the
   * balance is short — the caller should fall back to Razorpay checkout
   * for the full amount when this rejects with a 400.
   */
  payRideFromWallet: async (rideId: string) => {
    const { data } = await api.post('/payments/wallet/pay-ride', { rideId });
    return data;
  },

  // Payment history
  getPayments: async (page = 1, limit = 20) => {
    const { data } = await api.get('/payments', { params: { page, limit } });
    return data;
  },

  // Saved payment methods
  getSavedMethods: async () => {
    const { data } = await api.get('/payments/methods');
    return data;
  },

  addSavedMethod: async (payload: AddMethodPayload) => {
    const { data } = await api.post('/payments/methods', payload);
    return data;
  },

  deleteSavedMethod: async (id: string) => {
    const { data } = await api.delete(`/payments/methods/${id}`);
    return data;
  },

  setDefaultMethod: async (id: string) => {
    const { data } = await api.put(`/payments/methods/${id}/default`);
    return data;
  },

  // Promo
  validatePromo: async (code: string) => {
    const { data } = await api.post('/payments/promo/validate', { code });
    return data;
  },
};
