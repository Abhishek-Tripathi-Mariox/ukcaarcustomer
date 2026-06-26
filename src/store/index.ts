import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import rideReducer from './slices/rideSlice';
import appReducer from './slices/appSlice';
import geolocationReducer from './slices/geolocationSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ride: rideReducer,
    app: appReducer,
    geolocation: geolocationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
