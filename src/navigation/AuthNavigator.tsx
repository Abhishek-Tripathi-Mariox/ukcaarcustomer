import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '@/store/hooks';

import {
  SplashScreen,
  OnboardingScreen,
  LoginScreen,
  OTPVerificationScreen,
  CompleteProfileScreen,
  EnableLocationScreen,
} from '@/screens/auth';

export type AuthStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  OTPVerification: { phone: string; countryCode?: string };
  CompleteProfile: undefined;
  EnableLocation: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthNavigator: React.FC = () => {
  const { isAuthenticated, isProfileSetup } = useAppSelector((state) => state.auth);

  // If user is authenticated but hasn't completed profile, start at CompleteProfile
  const initialRoute = (isAuthenticated && !isProfileSetup) ? 'CompleteProfile' : 'Splash';

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
      <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      <Stack.Screen name="EnableLocation" component={EnableLocationScreen} />
    </Stack.Navigator>
  );
};
