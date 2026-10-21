import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import api, { setTokens, clearTokens } from '../../src/services/api';
import { USE_FIREBASE_PHONE_AUTH } from '../../src/services/authConfig';
import { authService } from '../../src/services/authService';

jest.mock('@react-native-async-storage/async-storage', () => ({ setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('@react-native-firebase/auth', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../src/services/api', () => ({ __esModule: true, default: { post: jest.fn() }, setTokens: jest.fn(), clearTokens: jest.fn() }));

describe('customer testing OTP', () => {
  const phone = { phone: '98765 43210', countryCode: '+91' };
  const result = { success: true, data: { user: { id: 'customer', role: 'customer' }, tokens: { accessToken: 'access', refreshToken: 'refresh' } } };
  beforeEach(() => { jest.clearAllMocks(); });

  test('send and resend retain the customer role guard without invoking Firebase', async () => {
    expect(USE_FIREBASE_PHONE_AUTH).toBe(false);
    api.post.mockResolvedValue({ data: { success: true } });
    await authService.sendOtp(phone);
    await authService.sendOtp({ ...phone, forceResend: true });
    expect(api.post).toHaveBeenCalledTimes(2);
    for (const [path, body] of api.post.mock.calls) {
      expect(path).toBe('/auth/send-otp');
      expect(body).toEqual({ phone: '9876543210', countryCode: '+91', appType: 'customer' });
    }
    expect(auth).not.toHaveBeenCalled();
  });

  test('verifies the default OTP server-side and persists the customer session without a Firebase handle', async () => {
    api.post.mockResolvedValue({ data: result });
    await expect(authService.verifyOtp({ ...phone, otp: '115566' })).resolves.toEqual(result);
    expect(api.post).toHaveBeenCalledWith('/auth/verify-otp', { phone: '9876543210', countryCode: '+91', otp: '115566', appType: 'customer' });
    expect(setTokens).toHaveBeenCalledWith('access', 'refresh');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('user', JSON.stringify(result.data.user));
    expect(auth).not.toHaveBeenCalled();
  });

  test('a driver response cannot establish a customer session', async () => {
    api.post.mockResolvedValue({ data: { ...result, data: { ...result.data, user: { id: 'driver', role: 'driver' } } } });
    await expect(authService.verifyOtp({ ...phone, otp: '115566' })).rejects.toMatchObject({ response: { status: 403 } });
    expect(clearTokens).toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user');
    expect(setTokens).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  test('invalid OTP rejection is preserved without storing a session', async () => {
    const error = { response: { status: 400, data: { message: 'Invalid or expired OTP' } } };
    api.post.mockRejectedValue(error);
    await expect(authService.verifyOtp({ ...phone, otp: '000000' })).rejects.toBe(error);
    expect(setTokens).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  test('wrong-app or suspended-account rejection is preserved on resend', async () => {
    const error = { response: { status: 403, data: { message: 'Please use the UKCAAR Driver app.' } } };
    api.post.mockRejectedValue(error);
    await expect(authService.sendOtp({ ...phone, forceResend: true })).rejects.toBe(error);
    expect(auth).not.toHaveBeenCalled();
  });
});
