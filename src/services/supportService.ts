import api from './api';

export type TicketStatus =
  | 'open'
  | 'pending_user'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export interface TicketMessage {
  _id?: string;
  sender: string;
  senderRole: 'customer' | 'driver' | 'admin' | 'system';
  body: string;
  attachments?: string[];
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  closedByRole?: 'customer' | 'driver' | 'admin';
  messages?: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  category?: string;
  relatedRide?: string;
  relatedPayment?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Customer-facing support ticketing. Backed by the same endpoints the driver
 * app and admin console use (POST/GET /support/tickets). Admin replies come
 * back inside the ticket's `messages` array (internal admin notes are stripped
 * server-side, so the customer only sees real replies).
 */
export const supportService = {
  createTicket: async (payload: CreateTicketPayload): Promise<SupportTicket> => {
    const { data } = await api.post<{ success: boolean; data: SupportTicket }>(
      '/support/tickets',
      payload,
    );
    return data.data;
  },

  listMyTickets: async (): Promise<SupportTicket[]> => {
    const { data } = await api.get<{
      success: boolean;
      data: { items: SupportTicket[] };
    }>('/support/tickets?limit=50');
    return data?.data?.items ?? [];
  },

  getTicket: async (id: string): Promise<SupportTicket> => {
    const { data } = await api.get<{ success: boolean; data: SupportTicket }>(
      `/support/tickets/${id}`,
    );
    return data.data;
  },

  replyToTicket: async (id: string, body: string): Promise<SupportTicket> => {
    const { data } = await api.post<{ success: boolean; data: SupportTicket }>(
      `/support/tickets/${id}/messages`,
      { body },
    );
    return data.data;
  },

  closeTicket: async (id: string): Promise<SupportTicket> => {
    const { data } = await api.post<{ success: boolean; data: SupportTicket }>(
      `/support/tickets/${id}/close`,
    );
    return data.data;
  },
};
