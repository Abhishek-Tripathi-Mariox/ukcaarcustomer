import { istDateStr } from './date';

export interface ScheduledHistoryRide {
  status: string;
  rideType: string;
  isScheduled?: boolean;
  isActiveNow?: boolean;
  booking?: {
    departureDate?: string;
    departureTime?: string | null;
    journeyStatus?: string | null;
    earlyDrop?: { status?: string } | null;
  };
}

export const isScheduledRide = (ride: ScheduledHistoryRide): boolean =>
  ride.isScheduled === true || ride.rideType === 'scheduled';

export function scheduledHistoryGroup(ride: ScheduledHistoryRide, now = Date.now()): 'upcoming' | 'past' {
  const booking = ride.booking;
  if (['completed', 'cancelled', 'expired'].includes(ride.status) ||
      booking?.earlyDrop?.status === 'approved') return 'past';
  // A running shuttle remains accessible after its slot and across midnight.
  if (ride.isActiveNow || ['active', 'in_progress'].includes(booking?.journeyStatus ?? '')) return 'upcoming';
  if (['completed', 'cancelled', 'expired'].includes(booking?.journeyStatus ?? '')) return 'past';
  const date = booking?.departureDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'upcoming';
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return 'upcoming';
  const time = booking?.departureTime;
  if (time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const departure = Date.parse(`${date}T${time}:00+05:30`);
    return Number.isFinite(departure) && now >= departure ? 'past' : 'upcoming';
  }
  // Legacy tickets without a slot time still leave Upcoming after their date.
  const today = istDateStr(new Date(now));
  return date < today ? 'past' : 'upcoming';
}

export function isMissedScheduledRide(ride: ScheduledHistoryRide, now = Date.now()): boolean {
  return isScheduledRide(ride) && scheduledHistoryGroup(ride, now) === 'past' &&
    !['completed', 'cancelled'].includes(ride.status) &&
    ride.booking?.journeyStatus !== 'completed' && ride.booking?.earlyDrop?.status !== 'approved';
}
