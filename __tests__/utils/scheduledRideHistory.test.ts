import { describe, test, expect } from '@jest/globals';
import { isMissedScheduledRide, scheduledHistoryGroup, type ScheduledHistoryRide } from '../../src/utils/scheduledRideHistory';

const departure = Date.parse('2026-10-22T00:10:00+05:30');
const ride: ScheduledHistoryRide = {
  status: 'driver_assigned', rideType: 'scheduled',
  booking: { departureDate: '2026-10-22', departureTime: '00:10' },
};

describe('customer scheduled history', () => {
  const cutoffs: Array<[number, 'upcoming' | 'past']> = [[departure - 1, 'upcoming'], [departure, 'past'], [departure + 1, 'past']];
  test.each(cutoffs)(
    'classifies the IST midnight slot at %s as %s', (now, group) => {
      expect(scheduledHistoryGroup(ride, now)).toBe(group);
      expect(isMissedScheduledRide(ride, now)).toBe(group === 'past');
    },
  );
  test.each(['completed', 'cancelled', 'expired'])('%s bookings stay in Past even before departure', status => {
    expect(scheduledHistoryGroup({ ...ride, status }, departure - 60000)).toBe('past');
  });
  test.each(['active', 'in_progress'])('%s journeys stay accessible across midnight', journeyStatus => {
    const running = { ...ride, booking: { ...ride.booking, journeyStatus } };
    expect(scheduledHistoryGroup(running, departure + 86400000)).toBe('upcoming');
    expect(isMissedScheduledRide(running, departure + 86400000)).toBe(false);
  });
  test('a boarded rider remains live even without a journey status', () => {
    expect(scheduledHistoryGroup({ ...ride, isActiveNow: true }, departure + 60000)).toBe('upcoming');
  });
  test('an approved early drop stays in Past while the shuttle continues', () => {
    const dropped = { ...ride, booking: { ...ride.booking, journeyStatus: 'in_progress', earlyDrop: { status: 'approved' } } };
    expect(scheduledHistoryGroup(dropped, departure)).toBe('past');
    expect(isMissedScheduledRide(dropped, departure)).toBe(false);
  });
  test('a legacy booking without a time uses the IST date', () => {
    const legacy = { ...ride, booking: { departureDate: '2026-10-21' } };
    expect(scheduledHistoryGroup(legacy, Date.parse('2026-10-21T23:59:59+05:30'))).toBe('upcoming');
    expect(scheduledHistoryGroup(legacy, Date.parse('2026-10-22T00:00:00+05:30'))).toBe('past');
  });
  test('malformed dates are not treated as real missed departures', () => {
    const invalid = { ...ride, booking: { departureDate: '2026-02-31', departureTime: '09:00' } };
    expect(scheduledHistoryGroup(invalid, departure)).toBe('upcoming');
  });
});
