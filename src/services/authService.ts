import api, { setTokens, clearTokens } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SendOtpPayload {
  phone: string;
  countryCode: string;
}

export interface VerifyOtpPayload {
  phone: string;
  countryCode: string;
  otp: string;
}

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role: string;
  avatar?: string;
  isVerified: boolean;
  isProfileSetup?: boolean;
  savedAddresses?: SavedAddress[];
  /** Auto-generated unique code shown on the Refer & Earn screen. */
  referralCode?: string;
}

export interface SavedAddress {
  label: string;
  address: string;
  lat: number;
  lng: number;
  icon: string;
  isPrimary?: boolean;
  houseNo?: string;
  apartment?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
  };
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  language?: string;
}

// This is the customer app, so every OTP call is tagged as such. The backend
// uses this to keep driver/admin accounts out of the customer app (they share
// one OTP endpoint and one User collection).
const APP_TYPE = 'customer' as const;

export const authService = {
  sendOtp: async (payload: SendOtpPayload) => {
    const { data } = await api.post('/auth/send-otp', { ...payload, appType: APP_TYPE });
    return data;
  },

  verifyOtp: async (payload: VerifyOtpPayload): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/verify-otp', { ...payload, appType: APP_TYPE });
    // Defence in depth: even if an older backend (without the server-side role
    // guard) hands us a driver account, refuse it and drop the tokens the
    // request just persisted, so no driver session survives in the customer app.
    if (data.success && data.data?.user && data.data.user.role !== 'customer') {
      await clearTokens();
      await AsyncStorage.removeItem('user');
      const err: any = new Error('This number is registered as a driver. Please use the UKCAAR Driver app.');
      err.response = { status: 403, data: { message: err.message } };
      throw err;
    }
    if (data.success && data.data?.tokens) {
      await setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(data.data.user));
    }
    return data;
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },

  applyReferral: async (code: string) => {
    const { data } = await api.post('/auth/apply-referral', { code });
    return data as {
      success: boolean;
      data?: { applied: boolean; bonusCredited: number; referrerName: string };
      message?: string;
    };
  },

  deleteAccount: async () => {
    const { data } = await api.delete('/auth/me');
    return data;
  },

  updateProfile: async (payload: UpdateProfilePayload) => {
    const { data } = await api.put('/auth/profile', payload);
    if (data.success && data.data?.user) {
      await AsyncStorage.setItem('user', JSON.stringify(data.data.user));
    }
    return data;
  },

  updateSavedAddresses: async (addresses: SavedAddress[]) => {
    const { data } = await api.put('/drivers/saved-addresses', { addresses });
    return data;
  },

  setPrimaryAddress: async (index: number) => {
    const { data } = await api.patch(`/drivers/saved-addresses/${index}/primary`);
    return data;
  },

  uploadAvatar: async (imageUri: string) => {
    // Normalize extension → backend accepts JPG/PNG/WebP/PDF. react-native-image-picker
    // can hand us content:// URIs or temp filenames with no extension, so don't trust
    // whatever's on the URI — infer a valid mime and build a matching filename.
    const lastSegment = imageUri.split('/').pop() || '';
    const extMatch = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(lastSegment);
    const rawExt = extMatch ? extMatch[1].toLowerCase() : '';

    const extToMime: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/jpeg', // backend doesn't accept heic; upload as jpeg, phone will still send heic bytes — but this only matters on iOS
    };

    const mime = extToMime[rawExt] || 'image/jpeg';
    const finalExt = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const filename = `avatar.${finalExt}`;

    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type: mime,
    } as any);
    formData.append('type', 'avatar');

    const { data } = await api.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // The server-side logout is best-effort. If the token is already
      // invalid/expired (or the network is down), the call 401s/throws —
      // but the user still wants to be logged out locally, so we swallow
      // the error and clear local state below regardless.
      console.warn('[logout] server logout failed (continuing):', err);
    } finally {
      await clearTokens();
      // Clear the cached FCM token too. Otherwise a second user logging
      // in on the same device skips token re-registration (the `synced`
      // flag is true from the previous session) and the backend keeps
      // pushes pointed at the previous user's record.
      try {
        const { clearFcmToken } = await import('./fcmService');
        await clearFcmToken();
      } catch (err) {
        console.warn('[logout] fcm clear failed (continuing):', err);
      }
    }
  },
};
