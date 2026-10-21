import React from 'react';
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { routeService } from '../../src/services/routeService';
import { ScheduledVehicleScreen } from '../../src/screens/scheduled/ScheduledVehicleScreen';
import { ScheduledSeatScreen } from '../../src/screens/scheduled/ScheduledSeatScreen';
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  StatusBar: 'StatusBar',
  RefreshControl: 'RefreshControl',
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  StyleSheet: {
    create: styles => styles
  }
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0
  })
}));
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../../src/components/icons/SeatIcons', () => ({
  BusSeatIcon: 'BusSeatIcon',
  DriverHeadIcon: 'DriverHeadIcon'
}));
jest.mock('../../src/theme', () => ({
  Colors: {
    primary: '#0097B3',
    white: '#FFF',
    textPrimary: '#000',
    error: '#F00'
  },
  Shadow: {},
  alpha: color => color
}));
jest.mock('../../src/theme/responsive', () => ({
  fs: n => n,
  s: n => n,
  vs: n => n
}));
jest.mock('../../src/services/routeService', () => ({
  routeService: {
    listVehicles: jest.fn(),
    listAlternatives: jest.fn(),
    getSeats: jest.fn()
  }
}));
const vehicle = capacity => ({
  driverId: `driver${capacity}`,
  driverName: `Driver ${capacity}`,
  rating: 5,
  totalTrips: 10,
  capacity,
  booked: 0,
  available: capacity,
  vehicle: {
    model: `Car ${capacity}`,
    typeCode: 'car'
  }
});
const params = {
  route: {
    id: 'route',
    name: 'Mixed fleet',
    price: 100,
    capacity: 99
  },
  boarding: {
    sequence: 0, name: 'A'
  },
  dropping: {
    sequence: 1, name: 'B'
  },
  departureDate: '2026-10-22',
  departureIndex: 0,
  unitFare: 100
};
describe('customer vehicle capacity screens', () => {
  let tree;
  beforeEach(() => {
    jest.clearAllMocks();
    routeService.listAlternatives.mockResolvedValue([]);
    routeService.listVehicles.mockResolvedValue({
      totalSeats: 99,
      vehicles: [vehicle(4), vehicle(7)]
    });
    routeService.getSeats.mockResolvedValue({
      totalSeats: 4,
      booked: [2]
    });
  });
  afterEach(() => {
    if (tree) act(() => tree.unmount());
  });
  const buttonWithText = text => tree.root.findAll(node => node.type === 'TouchableOpacity').find(node => node.findAll(child => child.type === 'Text').some(child => child.props.children === text));
  test('the passenger stepper follows actual vehicle capacities and disables undersized vehicles', async () => {
    const navigation = {
      navigate: jest.fn()
    };
    await act(async () => {
      tree = create(<ScheduledVehicleScreen navigation={navigation} route={{
        params
      }} />);
    });
    const plus = () => tree.root.findAll(node => node.type === 'TouchableOpacity').find(node => node.findAll(child => child.type === 'Icon').some(child => child.props.name === 'add'));
    for (let i = 1; i < 7; i++) act(() => plus().props.onPress());
    expect(plus().props.disabled).toBe(true);
    expect(buttonWithText('Car 4').props.disabled).toBe(true);
    expect(buttonWithText('Car 7').props.disabled).toBe(false);
    act(() => buttonWithText('Car 7').props.onPress());
    const continueButton = tree.root.findAll(node => node.type === 'TouchableOpacity').find(node => node.findAll(child => child.type === 'Text').some(child => String(child.props.children).startsWith('Continue')));
    act(() => continueButton.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledSeat', expect.objectContaining({
      driverId: 'driver7',
      seatsNeeded: 7,
      vehicle: expect.objectContaining({
        capacity: 7
      })
    }));
  });
  test('the seat map draws only the selected vehicle seats and disables its reserved seats', async () => {
    await act(async () => {
      tree = create(<ScheduledSeatScreen navigation={{
        navigate: jest.fn(),
        goBack: jest.fn()
      }} route={{
        params: {
          ...params,
          driverId: 'driver4',
          vehicle: vehicle(4),
          seatsNeeded: 1
        }
      }} />);
    });
    const seatButtons = tree.root.findAll(node => node.type === 'TouchableOpacity' && node.findAll(child => child.type === 'BusSeatIcon').length > 0);
    expect(seatButtons).toHaveLength(4);
    const seatTwo = tree.root.findAll(node => node.type === 'TouchableOpacity').find(node => node.findAll(child => child.type === 'Text').some(child => child.props.children === 2));
    expect(seatTwo.props.disabled).toBe(true);
    expect(routeService.getSeats).toHaveBeenCalledWith('route', expect.objectContaining({
      driverId: 'driver4'
    }));
  });
  test('empty departures offer real alternative times and routes without automatically booking', async () => {
    routeService.listVehicles.mockResolvedValue({ totalSeats: 0, vehicles: [] });
    const alternative = { route: { _id: 'other-route', name: 'Alternative shuttle', stops: [{ name: 'A nearby', sequence: 0 }, { name: 'B nearby', sequence: 1, fareFromPrevious: 125 }], schedule: { seatPrice: 100, bookingCutoffMinutes: 20 } }, departureDate: '2026-10-22', departureIndex: 1, departureTime: '11:00', boarding: { name: 'A nearby', sequence: 0 }, dropping: { name: 'B nearby', sequence: 1 }, availableSeats: 4, vehicleCount: 1 };
    routeService.listAlternatives.mockResolvedValue([alternative]);
    const navigation = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn() };
    await act(async () => { tree = create(<ScheduledVehicleScreen navigation={navigation} route={{ params }} />); });
    expect(routeService.listAlternatives).toHaveBeenCalledWith('route', expect.objectContaining({ date: '2026-10-22', boardingStopSequence: 0, droppingStopSequence: 1, seats: 1, days: 7 }));
    expect(navigation.push).not.toHaveBeenCalled();
    act(() => buttonWithText('Alternative shuttle').props.onPress());
    expect(navigation.push).toHaveBeenCalledWith('ScheduledVehicle', expect.objectContaining({ route: expect.objectContaining({ id: 'other-route', name: 'Alternative shuttle' }), departureIndex: 1, departureDate: '2026-10-22', boarding: expect.objectContaining({ sequence: 0, name: 'A nearby' }), dropping: expect.objectContaining({ sequence: 1 }), unitFare: 125 }));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
  test('full vehicles also offer alternatives and show an honest no-results state', async () => {
    routeService.listVehicles.mockResolvedValue({ totalSeats: 4, vehicles: [{ ...vehicle(4), available: 0, booked: 4 }] });
    routeService.listAlternatives.mockResolvedValue([]);
    await act(async () => { tree = create(<ScheduledVehicleScreen navigation={{ navigate: jest.fn() }} route={{ params }} />); });
    expect(routeService.listAlternatives).toHaveBeenCalled();
    expect(tree.root.findAll(node => node.type === 'Text').some(node => String(node.props.children).includes('No matching departures have enough seats'))).toBe(true);
  });

});
