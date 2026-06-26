import api from './api';

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface SosResult {
  ticketNumber: string;
  notifiedContacts: number;
}

/**
 * Safety / SOS. Emergency contacts persist on the user record; SOS opens an
 * urgent safety ticket on the admin console and (during a ride) pushes a live
 * alert on the ride room.
 */
export const safetyService = {
  getContacts: async (): Promise<EmergencyContact[]> => {
    const { data } = await api.get<{
      success: boolean;
      data: { contacts: EmergencyContact[] };
    }>('/safety/contacts');
    return data?.data?.contacts ?? [];
  },

  saveContacts: async (contacts: EmergencyContact[]): Promise<EmergencyContact[]> => {
    const { data } = await api.put<{
      success: boolean;
      data: { contacts: EmergencyContact[] };
    }>('/safety/contacts', { contacts });
    return data?.data?.contacts ?? [];
  },

  sendSos: async (payload: { lat?: number; lng?: number; rideId?: string }): Promise<SosResult> => {
    const { data } = await api.post<{ success: boolean; data: SosResult }>(
      '/safety/sos',
      payload,
    );
    return data.data;
  },
};
