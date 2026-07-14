import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator, StatusBar } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout, fetchProfile } from '@/store/slices/authSlice';
import { setWalletBalance } from '@/store/slices/appSlice';
import { paymentService } from '@/services/paymentService';
import {
  UserIcon,
  BellIcon,
  SavePaymentIcon,
  HistoryIcon,
  SettingsIcon,
  ShareBoxIcon,
  ChevronRightIcon,
  BackArrowIcon,
  NotifyBellIcon,
  PhoneIcon,
  LogoutIcon,
  ToggleSwitch,
} from '@/components/icons/ProfileIcons';
import { SecuredShieldIcon } from '@/components/icons/PaymentOptionIcons';
import { HomeGlyphIcon } from '@/components/icons/TabBarIcons';

import { HomeScreen } from '@/screens/home';
import {
  SearchRideScreen,
  SelectLocationScreen,
  SelectRideScreen,
  RideTrackingScreen,
  RideCompleteScreen,
  CancelRideScreen,
  CancelReasonScreen,
  FindingDriverScreen,
  InRideScreen,
  RideHistoryScreen,
  RideDetailsScreen,
} from '@/screens/ride';
import { PaymentScreen, PaymentSuccessScreen, WalletTopUpScreen, PaymentOptionScreen, UpiPaymentScreen } from '@/screens/payment';
import { ChatScreen } from '@/screens/chat';
import {
  SavedAddressesScreen,
  EditProfileScreen,
  AddAddressScreen,
  NotificationsScreen,
  SafetyScreen,
  HelpSupportScreen,
  LoyaltyScreen,
  MyTicketsScreen,
  TicketThreadScreen,
  SettingsScreen,
} from '@/screens/profile';
import { ShareRideScreen, ReferEarnScreen } from '@/screens/misc';
import { recordTabFocus } from './tabHistory';
import {
  ScheduledRouteScreen,
  ScheduledBoardingDropScreen,
  ScheduledVehicleScreen,
  ScheduledSeatScreen,
  ScheduledPassengerDetailsScreen,
  ScheduledFareSummaryScreen,
  ScheduledPaymentScreen,
  ScheduledBookingDetailsScreen,
  ScheduledTripSummaryScreen,
  ScheduledTrackScreen,
} from '@/screens/scheduled';

// ── Account / Profile Screen — matches Figma node 49:1365 ──
const AccountScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user, loading } = useAppSelector((state) => state.auth);

  const [pushNotifications, setPushNotifications] = useState(true);
  const [promoNotifications, setPromoNotifications] = useState(true);

  useEffect(() => {
    dispatch(fetchProfile());
    paymentService.getWallet().then((res) => {
      if (res.success) dispatch(setWalletBalance(res.data.wallet?.balance || 0));
    }).catch(() => {});
  }, [dispatch]);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(logout()).unwrap();
              navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Auth' }] });
            } catch (err) {
              Alert.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Guest';
  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : '?';
  const email = user?.email || 'Not set';

  if (loading && !user) {
    return (
      <View style={[profileStyles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={profileStyles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      {/* Teal header */}
      <View style={[profileStyles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          style={profileStyles.headerBack}
          onPress={() => navigation.navigate('Home')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackArrowIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        style={profileStyles.scroll}
        contentContainerStyle={profileStyles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <View style={profileStyles.profileTop}>
          <View style={profileStyles.avatar}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={profileStyles.avatarImage} />
            ) : (
              <Text style={profileStyles.avatarText}>{initials}</Text>
            )}
          </View>
          <Text style={profileStyles.profileName}>{fullName}</Text>
          <Text style={profileStyles.profileEmail}>{email}</Text>
          <TouchableOpacity
            style={profileStyles.editBtn}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
          >
            <Text style={profileStyles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* GENERAL */}
        <Text style={profileStyles.sectionTitle}>GENERAL</Text>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.7}
        >
          <UserIcon size={24} color={Colors.primary} />
          <Text style={profileStyles.rowLabel}>Update User Profile</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <BellIcon size={24} color={Colors.primary} />
          <Text style={profileStyles.rowLabel}>Notification</Text>
          <Text style={profileStyles.rowAllow}>Allow</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('Payment')}
          activeOpacity={0.7}
        >
          <SavePaymentIcon size={20} color={Colors.primary} />
          <Text style={[profileStyles.rowLabel, { marginLeft: 14 }]}>Save Payment Method</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('SavedAddresses')}
          activeOpacity={0.7}
        >
          <HistoryIcon size={24} color={Colors.primary} />
          <Text style={profileStyles.rowLabel}>Saved Address</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('Activity')}
          activeOpacity={0.7}
        >
          <HistoryIcon size={24} color={Colors.primary} />
          <Text style={profileStyles.rowLabel}>Ride History</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('Safety')}
          activeOpacity={0.7}
        >
          <SecuredShieldIcon size={22} />
          <Text style={[profileStyles.rowLabel, { marginLeft: 14 }]}>Safety</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('HelpSupport')}
          activeOpacity={0.7}
        >
          <SettingsIcon size={24} color={Colors.primary} />
          <Text style={profileStyles.rowLabel}>Help & Support</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('Loyalty')}
          activeOpacity={0.7}
        >
          <SecuredShieldIcon size={20} />
          <Text style={[profileStyles.rowLabel, { marginLeft: 14 }]}>Rewards & Points</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('ReferEarn')}
          activeOpacity={0.7}
        >
          <ShareBoxIcon size={20} color={Colors.primary} />
          <View style={profileStyles.rowTextWrap}>
            <Text style={[profileStyles.rowLabel, profileStyles.rowLabelTight]}>Refer to Friends</Text>
            <Text style={profileStyles.rowSubLabel}>Get ₹10 for reffering friends</Text>
          </View>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        {/* NOTIFICATIONS */}
        <Text style={[profileStyles.sectionTitle, { marginTop: 24 }]}>NOTIFICATIONS</Text>

        <View style={profileStyles.toggleRow}>
          <NotifyBellIcon size={24} color="#1B1D21" />
          <View style={profileStyles.rowTextWrap}>
            <Text style={profileStyles.toggleLabel}>Push Notifications</Text>
            <Text style={profileStyles.rowSubLabel}>For daily update and others.</Text>
          </View>
          <TouchableOpacity onPress={() => setPushNotifications(!pushNotifications)} activeOpacity={0.8}>
            <ToggleSwitch on={pushNotifications} />
          </TouchableOpacity>
        </View>

        <View style={profileStyles.toggleRow}>
          <NotifyBellIcon size={24} color="#1B1D21" />
          <View style={profileStyles.rowTextWrap}>
            <Text style={profileStyles.toggleLabel}>Promotional Notifications</Text>
            <Text style={profileStyles.rowSubLabel}>New Campaign & Offers</Text>
          </View>
          <TouchableOpacity onPress={() => setPromoNotifications(!promoNotifications)} activeOpacity={0.8}>
            <ToggleSwitch on={promoNotifications} />
          </TouchableOpacity>
        </View>

        {/* MORE */}
        <Text style={[profileStyles.sectionTitle, { marginTop: 24 }]}>MORE</Text>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
        >
          <SettingsIcon size={24} color={Colors.primary} />
          <Text style={profileStyles.rowLabel}>Settings</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={() => navigation.navigate('HelpSupport')}
          activeOpacity={0.7}
        >
          <PhoneIcon size={22} color="#1B1D21" />
          <View style={profileStyles.rowTextWrap}>
            <Text style={profileStyles.toggleLabel}>Contact Us</Text>
            <Text style={profileStyles.rowSubLabel}>For more information</Text>
          </View>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={profileStyles.row}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <LogoutIcon size={22} color="#1B1D21" />
          <Text style={[profileStyles.rowLabel, { marginLeft: 14 }]}>Logout</Text>
          <ChevronRightIcon size={24} color="#6B7280" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const profileStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  header: {
    backgroundColor: '#0097B3',
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBack: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    lineHeight: 28,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  profileTop: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: '#0097B3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  profileName: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    lineHeight: 28,
    color: '#000000',
    letterSpacing: -0.4,
    marginTop: 12,
  },
  profileEmail: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 24,
    color: '#0097B3',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  editBtn: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: '#0097B3',
    borderRadius: 22,
    paddingVertical: 7,
    paddingHorizontal: 25,
    backgroundColor: '#FFFFFF',
  },
  editBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    lineHeight: 24,
    color: '#1B1D21',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    lineHeight: 24,
    color: '#000000',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#1F2937',
  },
  rowLabelTight: {
    flex: 0,
  },
  rowSubLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(0,0,0,0.5)',
    marginTop: 4,
  },
  rowAllow: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#28C800',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(202, 200, 218, 0.2)',
  },
  toggleLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    lineHeight: 20,
    color: '#1B1D21',
    letterSpacing: -0.28,
  },
});

// ── Tab Navigator (3 tabs: Activity, Home, Account) ──
const Tab = createBottomTabNavigator();

const TabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenListeners={({ route }) => ({
        focus: () => recordTabFocus(route.name),
      })}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.backgroundCard,
          borderTopWidth: 1,
          borderTopColor: Colors.divider,
          height: 58 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
        // Figma footer (20087213.svg): the active tab's LABEL is dark bold,
        // not tinted teal like the icon — so we render the label ourselves
        // instead of letting it inherit tabBarActiveTintColor.
        tabBarLabel: ({ focused }) => (
          <Text
            style={{
              // No Inter font is bundled, so drive weight via fontWeight (real
              // bold) rather than a fontFamily that would fall back to regular.
              fontWeight: focused ? '700' : '500',
              fontSize: 11,
              color: focused ? Colors.textPrimary : Colors.tabInactive,
            }}
          >
            {route.name}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => {
          switch (route.name) {
            case 'Activity':
              // Note/document glyph (rounded card with content lines) per Figma
              return (
                <Ionicons
                  name={focused ? 'document-text' : 'document-text-outline'}
                  size={23}
                  color={color}
                />
              );
            case 'Home':
              // Custom filled-teal rounded house with a base notch.
              return <HomeGlyphIcon size={24} color={color} focused={focused} />;
            case 'Account':
              // Person-in-a-circle glyph per Figma (not the bare person).
              return (
                <Ionicons
                  name={focused ? 'person-circle' : 'person-circle-outline'}
                  size={25}
                  color={color}
                />
              );
            default:
              return null;
          }
        },
      })}
    >
      <Tab.Screen name="Activity" component={RideHistoryScreen} />
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
};

// ---- Main Stack (Tab + Modal screens) ----
const Stack = createNativeStackNavigator();

export const MainNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="SearchRide" component={SearchRideScreen} />
      <Stack.Screen name="SelectLocation" component={SelectLocationScreen} />
      <Stack.Screen name="SelectRide" component={SelectRideScreen} />
      <Stack.Screen
        name="FindingDriver"
        component={FindingDriverScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="RideTracking"
        component={RideTrackingScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="InRide"
        component={InRideScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="RideComplete" component={RideCompleteScreen} />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} />
      <Stack.Screen name="CancelReason" component={CancelReasonScreen} />
      <Stack.Screen
        name="CancelRide"
        component={CancelRideScreen}
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
      <Stack.Screen name="AddAddress" component={AddAddressScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Safety" component={SafetyScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
      <Stack.Screen name="MyTickets" component={MyTicketsScreen} />
      <Stack.Screen name="TicketThread" component={TicketThreadScreen} />
      <Stack.Screen name="Loyalty" component={LoyaltyScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen
        name="ShareRide"
        component={ShareRideScreen}
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />
      <Stack.Screen name="ReferEarn" component={ReferEarnScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="WalletTopUp" component={WalletTopUpScreen} />
      <Stack.Screen name="PaymentOption" component={PaymentOptionScreen} />
      <Stack.Screen name="UpiPayment" component={UpiPaymentScreen} />
      <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
      <Stack.Screen name="ScheduledRoute" component={ScheduledRouteScreen} />
      <Stack.Screen name="ScheduledBoardingDrop" component={ScheduledBoardingDropScreen} />
      <Stack.Screen name="ScheduledVehicle" component={ScheduledVehicleScreen} />
      <Stack.Screen name="ScheduledSeat" component={ScheduledSeatScreen} />
      <Stack.Screen name="ScheduledPassengerDetails" component={ScheduledPassengerDetailsScreen} />
      <Stack.Screen name="ScheduledFareSummary" component={ScheduledFareSummaryScreen} />
      <Stack.Screen name="ScheduledPayment" component={ScheduledPaymentScreen} />
      <Stack.Screen name="ScheduledBookingDetails" component={ScheduledBookingDetailsScreen} />
      <Stack.Screen name="ScheduledTripSummary" component={ScheduledTripSummaryScreen} />
      <Stack.Screen name="ScheduledTrack" component={ScheduledTrackScreen} />
    </Stack.Navigator>
  );
};
