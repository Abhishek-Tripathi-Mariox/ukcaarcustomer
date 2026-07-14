import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ── Config ──
// Set to true to force production API even in dev mode (for testing on physical devices)
const FORCE_PRODUCTION = true;

// Your dev machine's LAN IP — used ONLY by dev/USB (Metro) builds so a physical
// device on the same Wi-Fi reaches the local backend. Release/prod APKs always
// use the deployed backend (PRODUCTION_URL). Update if your IP changes —
// `ipconfig` on Windows, `ifconfig`/`ip addr` on macOS/Linux.
const LOCAL_IP = '192.168.1.34';
// Set to true ONLY when running in the Android emulator (uses 10.0.2.2 → host loopback).
// For physical Android/iOS devices and the iOS simulator, leave this false.
const USE_ANDROID_EMULATOR = false;

const PORT = 5000;
const PRODUCTION_URL = 'https://ukcaar.com/api/v1';

const devHost =
  Platform.OS === 'android' && USE_ANDROID_EMULATOR
    ? '10.0.2.2'   // Android emulator only
    : LOCAL_IP;    // physical device on same Wi-Fi (Android or iOS) and iOS simulator

// Dev/USB build → local LAN backend; release build → deployed backend.
export const BASE_URL = FORCE_PRODUCTION
  ? PRODUCTION_URL
  : __DEV__
    ? `http://${devHost}:${PORT}/api/v1`
    : PRODUCTION_URL;

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[api] BASE_URL =', BASE_URL);
}

const TIMEOUT = 15000;

// ── Token helpers ──
const getToken = () => AsyncStorage.getItem('accessToken');
const getRefreshToken = () => AsyncStorage.getItem('refreshToken');
const setTokens = async (access: string, refresh: string) => {
  await AsyncStorage.multiSet([
    ['accessToken', access],
    ['refreshToken', refresh],
  ]);
};
const clearTokens = () =>
  AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);

// ── Axios instance ──
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh token on 401
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) =>
  refreshSubscribers.push(cb);
const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            if (original.headers) original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const refresh = await getRefreshToken();
        const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, {
          refreshToken: refresh,
        });
        await setTokens(data.accessToken, data.refreshToken);
        onRefreshed(data.accessToken);
        if (original.headers)
          original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await clearTokens();
        // Refresh failed — the session is dead. Flip auth state so
        // AppNavigator unmounts MainApp and shows the login stack. Lazy
        // require avoids a circular import (store → slices → services → api).
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { store } = require('../store');
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { forceLogout } = require('../store/slices/authSlice');
          store.dispatch(forceLogout());
        } catch {
          /* store not ready (very early boot) — token already cleared */
        }
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  },
);

export { api, setTokens, clearTokens, getToken };
export default api;
