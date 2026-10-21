// Testing uses /auth/send-otp and /auth/verify-otp. The backend controls
// ALLOW_TEST_OTP and TEST_OTP (default 115566); no SMS is sent in this mode.
// Set true to restore Firebase phone verification when testing is complete.
// This switch does not affect Firebase push notifications.
export const USE_FIREBASE_PHONE_AUTH = false;
