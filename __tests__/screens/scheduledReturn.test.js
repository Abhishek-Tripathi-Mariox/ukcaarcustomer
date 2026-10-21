import React from 'react';
import { act, create } from 'react-test-renderer';
import { routeToUi } from '../../src/screens/scheduled/ScheduledRouteScreen';
import { ScheduledBoardingDropScreen } from '../../src/screens/scheduled/ScheduledBoardingDropScreen';
import { routeService } from '../../src/services/routeService';

jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', StatusBar: 'StatusBar', ActivityIndicator: 'ActivityIndicator', Alert: { alert: jest.fn() }, StyleSheet: { create: value => value } }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: callback => require('react').useEffect(callback, [callback]) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('../../src/theme', () => ({ Colors: {}, Shadow: {}, alpha: color => color }));
jest.mock('../../src/theme/responsive', () => ({ fs: n => n, s: n => n, vs: n => n }));
jest.mock('../../src/services/geoService', () => ({ geoService: {} }));
jest.mock('../../src/services/routeService', () => ({ routeService: { getById: jest.fn() } }));

const returning = { _id: 'route', name: 'Shuttle', direction: 'return', stops: [{ name: 'B', sequence: 0, lat: 29, lng: 78 }, { name: 'A', sequence: 1, lat: 28, lng: 77, fareFromPrevious: 50 }],
  schedule: { minimumJourneyMinutes: 120, daysOfWeek: [], departures: [{ time: '15:00', stopIndex: 1 }, { time: '17:00', stopIndex: 0, direction: 'return' }] }, nextDepartureDate: '2026-10-21', nextDepartureIndex: 1 };
describe('customer same-route return selection', () => {
  let tree;
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00+05:30'));
    jest.spyOn(console, 'error').mockImplementation(message => { if (!String(message).includes('react-test-renderer is deprecated')) throw new Error(String(message)); });
    routeService.getById.mockResolvedValue(returning);
  });
  afterEach(() => { if (tree) act(() => tree.unmount()); tree = undefined; jest.restoreAllMocks(); jest.useRealTimers(); });
  test('direction keeps a distinct selection key while retaining the real route ID and admin duration', () => {
    const back = routeToUi(returning);
    const outward = routeToUi({ ...returning, direction: 'outbound' });
    expect(back).toEqual(expect.objectContaining({ id: 'route', direction: 'return', from: 'B', to: 'A', durationMin: 120 }));
    expect(back.selectionKey).not.toEqual(outward.selectionKey);
    expect(back.id).toEqual(outward.id);
  });
  test('the stop picker reloads the return direction and never offers outward departures', async () => {
    const navigation = { navigate: jest.fn() };
    await act(async () => { tree = create(<ScheduledBoardingDropScreen navigation={navigation} route={{ params: { route: routeToUi(returning) } }} />); });
    expect(routeService.getById).toHaveBeenCalledWith('route', 'return');
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('5:00 PM');
    expect(rendered).not.toContain('3:00 PM');
    const confirm = tree.root.findAllByType('TouchableOpacity').find(node => node.findAllByType('Text').some(text => text.props.children === 'Confirm Points'));
    expect(confirm.props.disabled).toBe(false);
    act(() => confirm.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledVehicle', expect.objectContaining({ departureIndex: 1, boarding: expect.objectContaining({ name: 'B' }), dropping: expect.objectContaining({ name: 'A' }) }));
  });
  test('preserves the advertised future return date and slot instead of resetting to today', async () => {
    const future = { ...returning, schedule: { ...returning.schedule, departures: [...returning.schedule.departures, { time: '19:00', stopIndex: 0, direction: 'return' }] }, nextDepartureDate: '2026-10-23', nextDepartureIndex: 2 };
    routeService.getById.mockResolvedValue(future);
    const navigation = { navigate: jest.fn() };
    await act(async () => { tree = create(<ScheduledBoardingDropScreen navigation={navigation} route={{ params: { route: routeToUi(future) } }} />); });
    act(() => tree.root.findAllByType('TouchableOpacity').find(node => node.findAllByType('Text').some(text => text.props.children === 'Confirm Points')).props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledVehicle', expect.objectContaining({ departureDate: '2026-10-23', departureIndex: 2 }));
  });
  test('a Friday-only return never offers a Wednesday travel date', async () => {
    const friday = { ...returning, nextDepartureDate: '2026-10-23', schedule: { ...returning.schedule, daysOfWeek: [5] } };
    routeService.getById.mockResolvedValue(friday);
    const navigation = { navigate: jest.fn() };
    await act(async () => { tree = create(<ScheduledBoardingDropScreen navigation={navigation} route={{ params: { route: routeToUi(friday) } }} />); });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Today');
    act(() => tree.root.findAllByType('TouchableOpacity').find(node => node.findAllByType('Text').some(text => text.props.children === 'Confirm Points')).props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledVehicle', expect.objectContaining({ departureDate: '2026-10-23' }));
  });
  test('a return starting at Middle cannot offer boarding at B, before its origin', async () => {
    const middle = { ...returning, stops: [returning.stops[0], { name: 'Middle', sequence: 1, fareFromPrevious: 20 }, { ...returning.stops[1], sequence: 2 }], schedule: { ...returning.schedule, departures: [{ time: '17:00', stopIndex: 1, direction: 'return' }] }, nextDepartureIndex: 0 };
    routeService.getById.mockResolvedValue(middle);
    const navigation = { navigate: jest.fn() };
    await act(async () => { tree = create(<ScheduledBoardingDropScreen navigation={navigation} route={{ params: { route: routeToUi(middle) } }} />); });
    act(() => tree.root.findAllByType('TouchableOpacity').find(node => node.findAllByType('Text').some(text => text.props.children === 'Confirm Points')).props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('ScheduledVehicle', expect.objectContaining({ boarding: expect.objectContaining({ name: 'Middle' }), dropping: expect.objectContaining({ name: 'A' }), unitFare: 50 }));
  });
});
