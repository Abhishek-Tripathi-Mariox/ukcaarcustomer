import api, { setTokens, clearTokens } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

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

/**
 * Firebase phone sign-in state.
 *
 * signInWithPhoneNumber hands back a confirmation handle that must survive
 * between the Login screen (which requests the code) and the OTP screen
 * (which submits it). It is deliberately module-level rather than in Redux:
 * the handle is a live object with methods, so it is not serialisable and
 * would trip Redux's serialisability check.
 *
 * Killing the app between the two screens loses it — verifyOtp detects the
 * null and asks the user to request a fresh code.
 */
let phoneConfirmation: FirebaseAuthTypes.ConfirmationResult | null = null;

/** Maps Firebase's error codes to something a rider can act on. */
const phoneAuthMessage = (code?: string): string => {
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'That phone number does not look right. Please check and try again.';
    case 'auth/invalid-verification-code':
      return 'That code is incorrect. Please check and try again.';
    case 'auth/code-expired':
      return 'That code has expired. Please request a new one.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes before trying again.';
    case 'auth/quota-exceeded':
    case 'auth/missing-client-identifier':
      return 'Sign-in is temporarily unavailable. Please try again shortly.';
    case 'auth/network-request-failed':
      return 'No internet connection. Please check your network and try again.';
    default:
      return 'Could not sign you in. Please try again.';
  }
};

export const authService = {
  /**
   * Asks Firebase to text a verification code. Google sends the SMS from
   * their own registered sender, which is why UKCAAR needs no TRAI DLT
   * registration for login. Nothing hits our backend on this step.
   */
  sendOtp: async (payload: SendOtpPayload) => {
    const fullPhone = `${payload.countryCode}${payload.phone.replace(/\s/g, '')}`;
    try {
      phoneConfirmation = await auth().signInWithPhoneNumber(fullPhone);
      return { success: true };
    } catch (e: any) {
      const err: any = new Error(phoneAuthMessage(e?.code));
      err.response = { status: 400, data: { message: err.message } };
      throw err;
    }
  },

  /**
   * Confirms the code with Firebase, then trades the resulting ID token for
   * our own session at /auth/firebase-login. The code itself never reaches
   * our server.
   */
  verifyOtp: async (payload: VerifyOtpPayload): Promise<AuthResponse> => {
    if (!phoneConfirmation) {
      const err: any = new Error('Your session expired. Please request a new code.');
      err.response = { status: 400, data: { message: err.message } };
      throw err;
    }

    let idToken: string;
    try {
      const credential = await phoneConfirmation.confirm(payload.otp);
      if (!credential?.user) throw new Error('no user');
      idToken = await credential.user.getIdToken();
    } catch (e: any) {
      const err: any = new Error(phoneAuthMessage(e?.code));
      err.response = { status: 400, data: { message: err.message } };
      throw err;
    }

    // One-shot: a confirmed handle cannot be reused for another attempt.
    phoneConfirmation = null;

    const { data } = await api.post<AuthResponse>('/auth/firebase-login', {
      idToken,
      appType: APP_TYPE,
    });
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

  // serverSide=false skips the POST /auth/logout call — used right after
  // account deletion, where the token is already invalidated server-side so the
  // call would 401 (and trip the global 401→refresh interceptor for nothing).
  logout: async (serverSide = true) => {
    // Unregister this device's push token FIRST — before /auth/logout and
    // before clearTokens(), while the access token is still in storage for
    // the interceptor to attach. Run after clearTokens() (as it used to be)
    // the DELETE is unauthenticated, 401s, and the token stays on the user
    // record — a logged-out rider keeps receiving pushes.
    try {
      const { clearFcmToken } = await import('./fcmService');
      await clearFcmToken(serverSide);
    } catch (err) {
      console.warn('[logout] fcm clear failed (continuing):', err);
    }
    try {
      if (serverSide) await api.post('/auth/logout');
    } catch (err) {
      // The server-side logout is best-effort. If the token is already
      // invalid/expired (or the network is down), the call 401s/throws —
      // but the user still wants to be logged out locally, so we swallow
      // the error and clear local state below regardless.
      console.warn('[logout] server logout failed (continuing):', err);
    } finally {
      await clearTokens();
    }
  },
};
