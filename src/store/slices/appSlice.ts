import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { notificationService } from '@/services/notificationService';

interface AppState {
  walletBalance: number;
  isConnected: boolean;
  notificationCount: number;
}

const initialState: AppState = {
  walletBalance: 0,
  isConnected: true,
  notificationCount: 0,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setWalletBalance: (state, action: PayloadAction<number>) => {
      state.walletBalance = action.payload;
    },
    setConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
    },
    setNotificationCount: (state, action: PayloadAction<number>) => {
      state.notificationCount = action.payload;
    },
  },
});

export const { setWalletBalance, setConnected, setNotificationCount } = appSlice.actions;

/**
 * Pull the latest unread-notification count from the backend and push it
 * into the store so the Home badge stays current. Called on login, on every
 * foreground FCM push (real-time bump) and whenever Home regains focus.
 * Limit=1 keeps the payload tiny — we only read the global `unreadCount`.
 */
export const refreshNotificationCount =
  () => async (dispatch: (action: unknown) => void) => {
    try {
      const res = await notificationService.getNotifications(1, 1);
      if (res?.success) {
        dispatch(setNotificationCount(res.data.unreadCount || 0));
      }
    } catch {
      // Silent — keep the last known count rather than flashing to zero.
    }
  };

export default appSlice.reducer;
