import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService, SendOtpPayload, VerifyOtpPayload, UpdateProfilePayload, User, SavedAddress } from '@/services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isProfileSetup: boolean;
  loading: boolean;
  error: string | null;
  otpSent: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isProfileSetup: false,
  loading: false,
  error: null,
  otpSent: false,
};

export const sendOtp = createAsyncThunk(
  'auth/sendOtp',
  async (payload: SendOtpPayload, { rejectWithValue }) => {
    try {
      return await authService.sendOtp(payload);
    } catch (err: any) {
      console.log('sendOtp error:', err?.message, err?.code, err?.response?.status);
      const message = err.response?.data?.message 
        || err.message 
        || 'Network error - check your connection';
      return rejectWithValue(message);
    }
  },
);

export const verifyOtp = createAsyncThunk(
  'auth/verifyOtp',
  async (payload: VerifyOtpPayload, { rejectWithValue }) => {
    try {
      const response = await authService.verifyOtp(payload);
      const isSetup = !!response.data?.user?.isProfileSetup;
      await AsyncStorage.setItem('isProfileSetup', String(isSetup));
      return response;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Invalid OTP');
    }
  },
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (payload: UpdateProfilePayload, { rejectWithValue }) => {
    try {
      const response = await authService.updateProfile(payload);
      if (response.data?.user) {
        await AsyncStorage.setItem('isProfileSetup', 'true');
      }
      return response;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Profile update failed');
    }
  },
);

export const updateSavedAddresses = createAsyncThunk(
  'auth/updateSavedAddresses',
  async (addresses: SavedAddress[], { rejectWithValue }) => {
    try {
      return await authService.updateSavedAddresses(addresses);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update addresses');
    }
  },
);

export const setPrimaryAddress = createAsyncThunk(
  'auth/setPrimaryAddress',
  async (index: number, { rejectWithValue }) => {
    try {
      return await authService.setPrimaryAddress(index);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Failed to set primary address');
    }
  },
);

export const uploadAvatar = createAsyncThunk(
  'auth/uploadAvatar',
  async (imageUri: string, { rejectWithValue }) => {
    try {
      return await authService.uploadAvatar(imageUri);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || 'Avatar upload failed');
    }
  },
);

export const loadUser = createAsyncThunk('auth/loadUser', async () => {
  const userStr = await AsyncStorage.getItem('user');
  const token = await AsyncStorage.getItem('accessToken');
  const profileSetup = await AsyncStorage.getItem('isProfileSetup');

  // No token at all → straight to login.
  if (!token) return null;

  // Validate the cached token against the backend before trusting it. A
  // token issued elsewhere (e.g. a dev backend, or an old prod deploy, or
  // one restored by Android auto-backup after a reinstall) is rejected by
  // the current server — without this check the app lands on Home with a
  // token that 401s every request and shows stale placeholder data.
  try {
    const res = await authService.getMe();
    const freshUser: User | null = res?.data?.user ?? (userStr ? JSON.parse(userStr) : null);
    if (!freshUser) return null;
    await AsyncStorage.setItem('user', JSON.stringify(freshUser));
    return {
      user: freshUser,
      isProfileSetup: !!freshUser.isProfileSetup || profileSetup === 'true',
    };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      // Invalid / expired token — wipe everything and force login.
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user', 'isProfileSetup']);
      return null;
    }
    // Network / server-down error — don't punish a legitimately logged-in
    // user; stay optimistic with the cached profile if we have one.
    if (userStr) {
      return { user: JSON.parse(userStr) as User, isProfileSetup: profileSetup === 'true' };
    }
    return null;
  }
});

export const fetchProfile = createAsyncThunk('auth/fetchProfile', async (_, { rejectWithValue }) => {
  try {
    const response = await authService.getMe();
    if (response.success && response.data?.user) {
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      return response.data.user;
    }
    return null;
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch profile');
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await authService.logout();
  await AsyncStorage.removeItem('isProfileSetup');
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    resetOtp: (state) => { state.otpSent = false; },
    // Hard reset of auth state — used when a token is rejected at runtime
    // (e.g. the axios refresh path gives up). Flipping isAuthenticated to
    // false makes AppNavigator mount the Auth stack, sending the user to login.
    forceLogout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isProfileSetup = false;
      state.otpSent = false;
    },
    setUser: (state, action: PayloadAction<User>) => { state.user = action.payload; },
    setProfileSetup: (state, action: PayloadAction<boolean>) => { state.isProfileSetup = action.payload; },
  },
  extraReducers: (builder) => {
    builder
      // sendOtp
      .addCase(sendOtp.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(sendOtp.fulfilled, (state) => { state.loading = false; state.otpSent = true; })
      .addCase(sendOtp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // verifyOtp
      .addCase(verifyOtp.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(verifyOtp.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        const user = action.payload.data?.user || null;
        state.user = user;
        state.isProfileSetup = !!user?.isProfileSetup;
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // updateProfile
      .addCase(updateProfile.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.data?.user) {
          state.user = action.payload.data.user;
          state.isProfileSetup = true;
        }
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // uploadAvatar
      .addCase(uploadAvatar.fulfilled, (state, action) => {
        if (state.user && action.payload.data?.url) {
          state.user.avatar = action.payload.data.url;
        }
      })
      // fetchProfile
      .addCase(fetchProfile.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload;
          state.isAuthenticated = true;
        }
      })
      // loadUser
      .addCase(loadUser.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload.user;
          state.isAuthenticated = true;
          state.isProfileSetup = action.payload.isProfileSetup;
        }
      })
      // logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isProfileSetup = false;
        state.otpSent = false;
      });
  },
});

export const { clearError, resetOtp, setUser, setProfileSetup, forceLogout } = authSlice.actions;
export default authSlice.reducer;
