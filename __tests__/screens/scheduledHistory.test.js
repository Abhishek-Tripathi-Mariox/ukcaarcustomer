import React from 'react';
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { rideService } from '../../src/services/rideService';
import { RideHistoryScreen } from '../../src/screens/ride/RideHistoryScreen';
jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  StatusBar: 'StatusBar',
  Text: 'Text',
  View: 'View',
  RefreshControl: 'RefreshControl',
  Alert: {
    alert: jest.fn()
  },
  StyleSheet: {
    create: styles => styles
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({
      remove: jest.fn()
    }))
  }
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: effect => require('react').useEffect(effect, [effect])
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0
  })
}));
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../../src/theme', () => ({
  Colors: {
    primary: '#0097B3',
    white: '#FFFFFF'
  }
}));
jest.mock('../../src/theme/responsive', () => ({
  fs: n => n,
  s: n => n,
  vs: n => n
}));
jest.mock('../../src/components/RatingSheet', () => ({
  RatingSheet: () => null
}));
jest.mock('../../src/services/routeService', () => ({
  routeService: {
    cancelBooking: jest.fn()
  }
}));
jest.mock('../../src/services/rideService', () => ({
  rideService: {
    getRides: jest.fn()
  }
}));
const at = time => new Date(`2026-10-21T${time}+05:30`);
const ticket = (id, status = 'driver_assigned', date = '2026-10-21') => ({
  _id: `sched_${id}`,
  status,
  rideType: 'scheduled',
  isScheduled: true,
  createdAt: '2026-10-20T12:00:00Z',
  estimatedFare: 100,
  pickup: {
    address: `Pickup ${id}`
  },
  dropoff: {
    address: `Drop ${id}`
  },
  booking: {
    id,
    route: 'route',
    routeName: 'Shuttle',
    departureDate: date,
    departureTime: '09:00',
    seats: [1]
  }
});
describe('customer Scheduled > Upcoming / Past', () => {
  let tree;
  let navigation;
  const getRides = rideService.getRides;
  const texts = () => tree.root.findAll(node => node.type === 'Text').map(node => String(node.props.children)).join(' ');
  const button = label => tree.root.findAll(node => node.type === 'TouchableOpacity').find(node => node.findAll(child => child.type === 'Text').some(child => child.props.children === label));
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(at('08:59:59'));
    jest.clearAllMocks();
    navigation = {
      navigate: jest.fn()
    };
    getRides.mockResolvedValue({
      rides: [ticket('next'), ticket('done', 'completed', '2026-10-20'), ticket('cancelled', 'cancelled')],
      pagination: {
        page: 1,
        pages: 1
      }
    });
  });
  afterEach(() => {
    if (tree) act(() => tree.unmount());
    jest.useRealTimers();
  });
  async function openScheduled() {
    await act(async () => {
      tree = create(<RideHistoryScreen navigation={navigation} />);
    });
    act(() => button('Scheduled').props.onPress());
  }
  test('a cached departure moves to Past at its deadline and keeps its booking detail link', async () => {
    await openScheduled();
    expect(texts()).toContain('Pickup next');
    expect(texts()).not.toContain('Pickup done');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(texts()).not.toContain('Pickup next');
    act(() => button('Past').props.onPress());
    expect(texts()).toContain('Pickup next');
    expect(texts()).toContain('Pickup done');
    expect(texts()).toContain('Pickup cancelled');
    expect(texts()).toContain('Missed');
    expect(button('Cancel Ride')).toBeUndefined();
    act(() => button('Pickup next').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledTripHub', expect.objectContaining({
      bookingId: 'next'
    }));
  });
  test('older scheduled tickets can be loaded when page one has no scheduled rows', async () => {
    getRides.mockResolvedValueOnce({
      rides: [],
      pagination: {
        page: 1,
        pages: 2
      }
    });
    getRides.mockResolvedValueOnce({
      rides: [ticket('older', 'completed', '2026-09-01')],
      pagination: {
        page: 2,
        pages: 2
      }
    });
    await openScheduled();
    act(() => button('Past').props.onPress());
    await act(async () => {
      await button('Load older rides').props.onPress();
    });
    expect(getRides).toHaveBeenLastCalledWith(2, 50);
    expect(texts()).toContain('Pickup older');
    act(() => button('Pickup older').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledEarlyDropSummary', expect.objectContaining({
      bookingId: 'older',
      completed: true
    }));
  });
  test('refresh failures retain already-loaded tickets and offer retry', async () => {
    await openScheduled();
    getRides.mockRejectedValueOnce(new Error('offline'));
    const list = tree.root.findAll(node => node.type === 'ScrollView' && node.props.refreshControl)[0];
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });
    expect(texts()).toContain('Pickup next');
    expect(texts()).toContain('Could not refresh rides. Tap to retry.');
  });
  test('running shuttles remain in Upcoming and update from a foreground refresh', async () => {
    const running = {
      ...ticket('running'),
      isActiveNow: true
    };
    getRides.mockResolvedValue({
      rides: [running],
      pagination: {
        page: 1,
        pages: 1
      }
    });
    await openScheduled();
    jest.setSystemTime(at('12:00:00'));
    const foreground = AppState.addEventListener.mock.calls[0][1];
    await act(async () => {
      foreground('active');
    });
    expect(texts()).toContain('Pickup running');
    expect(texts()).toContain('Ongoing');
    act(() => button('Past').props.onPress());
    expect(texts()).not.toContain('Pickup running');
  });
});
