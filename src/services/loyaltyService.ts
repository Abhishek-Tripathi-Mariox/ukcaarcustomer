import api from './api';

export interface LoyaltyTier {
  _id: string;
  key: string;
  name: string;
  minLifetimePoints: number;
  earnMultiplier?: number;
  rideDiscountPct?: number;
}

export interface LoyaltyAccount {
  pointsBalance: number;
  lifetimePoints: number;
  tierKey?: string;
}

export interface LoyaltyMe {
  account: LoyaltyAccount;
  currentTier: LoyaltyTier | null;
  nextTier: LoyaltyTier | null;
  pointsToNextTier: number;
}

export interface LoyaltyReward {
  _id: string;
  name: string;
  description?: string;
  type: string;
  pointsCost: number;
  value: number;
}

export interface LoyaltyRedemption {
  _id: string;
  rewardSnapshot: { name: string; type: string; value: number; pointsCost: number };
  code: string;
  status: 'issued' | 'used' | 'expired' | 'cancelled';
  issuedAt: string;
  expiresAt?: string;
}

export interface LoyaltyTransaction {
  _id: string;
  type: string;
  points: number;
  description?: string;
  balanceAfter: number;
  createdAt: string;
}

/** Customer-facing loyalty / rewards. Backed by /loyalty/* (authorize customer). */
export const loyaltyService = {
  me: async (): Promise<LoyaltyMe> => {
    const { data } = await api.get<{ success: boolean; data: LoyaltyMe }>('/loyalty/me');
    return data.data;
  },

  rewards: async (): Promise<LoyaltyReward[]> => {
    const { data } = await api.get<{ success: boolean; data: { items: LoyaltyReward[] } }>(
      '/loyalty/rewards',
    );
    return data?.data?.items ?? [];
  },

  redemptions: async (): Promise<LoyaltyRedemption[]> => {
    const { data } = await api.get<{ success: boolean; data: { items: LoyaltyRedemption[] } }>(
      '/loyalty/redemptions',
    );
    return data?.data?.items ?? [];
  },

  transactions: async (): Promise<LoyaltyTransaction[]> => {
    const { data } = await api.get<{ success: boolean; data: { items: LoyaltyTransaction[] } }>(
      '/loyalty/transactions',
    );
    return data?.data?.items ?? [];
  },

  redeem: async (
    rewardId: string,
  ): Promise<{ walletCredited: number; fulfilled: 'wallet' | 'voucher'; redemption: LoyaltyRedemption }> => {
    const { data } = await api.post('/loyalty/redeem', { rewardId });
    return data.data;
  },
};
