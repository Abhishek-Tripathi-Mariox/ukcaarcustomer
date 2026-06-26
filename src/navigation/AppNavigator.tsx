import React, { useEffect } from 'react';
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
