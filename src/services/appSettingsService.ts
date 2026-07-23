import { api } from './api';

export interface AppSettings {
  appName: string;
  supportEmail: string;
  supportPhone: string;
  /** Credited to the JOINER when they apply someone's code. */
  referralBonus: number;
  /** Paid to the REFERRER once their referee completes a first ride. This is
   *  the figure Refer & Earn advertises ("invite a friend and earn X"). */
  referrerRewardCustomer: number;
  referrerRewardDriver: number;
  safetyHelpline: string;
  safetyGuidelinesUrl: string;
  maintenanceMode: boolean;
  currencySymbol: string;
}

const FALLBACK: AppSettings = {
  appName: 'UKCAAR',
  supportEmail: '',
  supportPhone: '',
  referralBonus: 0,
  referrerRewardCustomer: 0,
  referrerRewardDriver: 0,
  safetyHelpline: '',
  safetyGuidelinesUrl: '',
  maintenanceMode: false,
  currencySymbol: '₹',
};

// Short-TTL cache. These were cached for the WHOLE session, so an admin
// changing a value (e.g. the referral reward) didn't show in the app until a
// full restart — which read as "the page is still hardcoded". 5 minutes keeps
// screens snappy while picking up admin edits on the next visit.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: AppSettings | null = null;
let cachedAt = 0;
let inflight: Promise<AppSettings> | null = null;

/**
 * Admin-configured values the app must never hardcode — support phone/email,
 * the referral bonus, and the safety helpline/guidelines links. Previously each
 * screen carried its own literal, so the referral amount disagreed between the
 * Account row (₹10) and Refer & Earn (₹400), and "Call us" dialled the
 * placeholder +911800XXXXXXX.
 *
 * Never throws — screens fall back to hiding the affected action rather than
 * showing a wrong value.
 */
export const appSettingsService = {
  get: async (force = false): Promise<AppSettings> => {
    const freshEnough = cached && Date.now() - cachedAt < CACHE_TTL_MS;
    if (freshEnough && !force) return cached!;
    if (inflight && !force) return inflight;
    inflight = api
      .get('/settings/app')
      .then(({ data }): AppSettings => {
        const d = data?.data ?? {};
        const next: AppSettings = {
          ...FALLBACK,
          ...d,
          referralBonus: Number(d.referralBonus ?? 0),
          referrerRewardCustomer: Number(d.referrerRewardCustomer ?? 0),
          referrerRewardDriver: Number(d.referrerRewardDriver ?? 0),
        };
        cached = next;
        cachedAt = Date.now();
        return next;
      })
      .catch((): AppSettings => cached ?? FALLBACK)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  /** Last known values without triggering a fetch. */
  peek: (): AppSettings => cached ?? FALLBACK,
};
