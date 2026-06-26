import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './api';

/**
 * Customer-side Socket.IO client. Listens for the events the backend emits
 * during the ride lifecycle so the home/tracking screens can update in
 * real time without polling:
 *
 *   ride:driver-assigned   — a driver accepted; render the "driver on the
 *                            way" sheet with vehicle + ETA.
 *   ride:status            — driver_arriving / arrived / in_progress /
 *                            completed transitions.
 *
 * Both events carry the full hydrated ride object so the listener can
 * dispatch directly to Redux without an extra GET.
 */
const SOCKET_URL = BASE_URL.replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;

// Rooms the app has asked to join. Tracked here (not just on the socket)
// so that:
//   1. Calls to joinRideRoom() that arrive before the socket connects
//      aren't silently dropped — we replay them on `connect`.
//   2. After a reconnect (network blip, app foregrounding), socket.io
//      doesn't carry over room membership; we re-emit so the customer
//      keeps receiving driver:location:update for their active ride.
// `leaveRideRoom()` removes from this set.
const joinedRooms = new Set<string>();
// Mirror of `joinedRooms` for scheduled-route subscriptions. Kept
// separate so a `ride:leave` doesn't accidentally drop the rider out
// of their scheduled-shuttle room (different room namespace on the
// backend, different replay loop on reconnect).
const joinedRouteRooms = new Set<string>();

type Listeners = {
  onDriverAssigned?: (payload: { ride: any }) => void;
  onRideStatus?: (payload: { rideId: string; status: string; ride: any }) => void;
  /** Live driver GPS, scoped to either the joined ride room (for
   *  instant/private rides) or the joined scheduled-route room (for
   *  shuttles). Exactly one of `rideId` / `routeId` is set depending
   *  on the source — listeners interested in route updates should
   *  filter on `routeId`. */
  onDriverLocation?: (payload: {
    rideId?: string;
    routeId?: string;
    driverId?: string;
    location: { lat: number; lng: number; heading?: number };
    timestamp: number;
  }) => void;
  /** Ride cancelled outside the customer's control — admin cancel, driver
   *  cancel, or 5-minute auto-cancel for failed dispatch. Tracking and
   *  finding-driver screens should dismiss and route the user home. */
  onRideCancelled?: (payload: {
    rideId: string;
    reason?: string;
    cancelledBy?: 'customer' | 'driver' | 'admin' | 'system';
    message?: string;
  }) => void;
  /** New chat message from the other party. Scoped to the joined ride
   *  room — driver/customer must have joined via joinRideRoom(rideId). */
  onChatMessage?: (payload: {
    rideId: string;
    sender: string;
    message: string;
    type?: string;
    timestamp: number;
  }) => void;
};

let listeners: Listeners = {};

export function setSocketListeners(next: Listeners): void {
  listeners = { ...listeners, ...next };
}

export async function connectSocket(): Promise<Socket | null> {
  const token = await AsyncStorage.getItem('accessToken');
  if (!token) return null;

  if (socket && socket.connected) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const s = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  s.on('connect', () => {
    console.log('[customer-socket] connected');
    // Replay any pending room joins. This covers two cases: a join that
    // was called while the socket was disconnected (silent no-op without
    // this), and a reconnect after a network blip where the server has
    // forgotten our rooms. Cheap to spam — the server's ride:join handler
    // is idempotent.
    for (const rideId of joinedRooms) {
      s.emit('ride:join', rideId);
    }
    for (const routeId of joinedRouteRooms) {
      s.emit('route:join', routeId);
    }
  });
  s.on('disconnect', reason => console.log('[customer-socket] disconnected:', reason));
  s.on('connect_error', err => console.warn('[customer-socket] error:', err.message));

  s.on('ride:driver-assigned', payload => {
    listeners.onDriverAssigned?.(payload);
  });

  s.on('ride:status', payload => {
    listeners.onRideStatus?.(payload);
  });

  s.on('driver:location:update', payload => {
    listeners.onDriverLocation?.(payload);
  });

  s.on('ride:cancelled', payload => {
    listeners.onRideCancelled?.(payload);
  });

  s.on('chat:new-message', payload => {
    listeners.onChatMessage?.(payload);
  });

  socket = s;
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Subscribe to a specific ride's room (location updates, chat, etc.).
 *  Idempotent and connect-safe: if the socket isn't ready yet, the join
 *  is queued and replayed once the connection comes up. */
export function joinRideRoom(rideId: string): void {
  joinedRooms.add(rideId);
  if (socket?.connected) {
    socket.emit('ride:join', rideId);
  }
}

export function leaveRideRoom(rideId: string): void {
  joinedRooms.delete(rideId);
  if (socket?.connected) {
    socket.emit('ride:leave', rideId);
  }
}

/** Subscribe to a scheduled-route's room so the rider receives
 *  `driver:location:update` events for the bus operating the route.
 *  Mirrors `joinRideRoom` exactly: idempotent + connect-safe (queued
 *  and replayed on reconnect via the joinedRouteRooms set). */
export function joinRouteRoom(routeId: string): void {
  if (!routeId) return;
  joinedRouteRooms.add(routeId);
  if (socket?.connected) {
    socket.emit('route:join', routeId);
  }
}

export function leaveRouteRoom(routeId: string): void {
  if (!routeId) return;
  joinedRouteRooms.delete(routeId);
  if (socket?.connected) {
    socket.emit('route:leave', routeId);
  }
}

/**
 * Send a chat message. The backend rebroadcasts as `chat:new-message` to
 * every socket in the ride room (driver + customer) AND persists it.
 * No-op if the socket isn't connected — caller should fall back to REST
 * for offline-while-typing situations if they care.
 */
export function sendChatMessage(rideId: string, message: string, type: string = 'text'): void {
  if (!socket?.connected) return;
  socket.emit('chat:message', { rideId, message, type });
}
