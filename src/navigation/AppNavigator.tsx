import React, { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { Colors } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loadUser } from '@/store/slices/authSlice';
import { usePermissions } from '@/hooks/usePermissions';

const RootStack = createNativeStackNavigator();

// Singleton ref so non-component code (auth bridge, FCM handler, socket
// bridge) can navigate without hooking into the React tree. Exposed via
// this module so callers don't have to drill props.
export const navigationRef = createNavigationContainerRef<any>();

const linking = {
  prefixes: ['ukcaar://', 'https://ukcaar.com'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
        },
      },
      MainApp: {
        screens: {
          MainTabs: {
            screens: {
              Home: 'home',
              Activity: 'activity',
              Account: 'account',
            },
          },
        },
      },
    },
  },
};

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isProfileSetup } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();

  // Request all permissions on app start
  usePermissions();

  useEffect(() => {
    dispatch(loadUser());
  }, [dispatch]);

  // User is authenticated but hasn't completed their profile yet
  const needsProfileCompletion = isAuthenticated && !isProfileSetup;

  // Centralized session-end ejection. The root keeps MainApp mounted so the
  // onboarding flow (which lives inside the Auth stack) can reset OUT to
  // MainApp — which also means flipping isAuthenticated to false does NOT swap
  // stacks by itself. Every path that ends a session — Log Out, Delete
  // Account, or the 401→refresh interceptor giving up — sets isAuthenticated
  // false; catch that transition here and reset to the (now-mounted) Auth
  // stack, so no individual screen needs its own logout navigation.reset.
  const wasAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated && navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'Auth' }] });
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={{
        dark: false,
        colors: {
          primary: Colors.primary,
          background: Colors.background,
          card: Colors.backgroundCard,
          text: Colors.textPrimary,
          border: Colors.border,
          notification: Colors.error,
        },
      }}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {(!isAuthenticated || needsProfileCompletion) ? (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : null}
        <RootStack.Screen name="MainApp" component={MainNavigator} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
};
