import api from './api';

export interface AppNotification {
  _id: string;
  title: string;
  body: string;
  type: 'ride' | 'payment' | 'promo' | 'safety' | 'system';
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export const notificationService = {
  getNotifications: async (page = 1, limit = 30) => {
    const { data } = await api.get('/notifications', { params: { page, limit } });
    return data;
  },

  markAsRead: async (id: string) => {
    const { data } = await api.put(`/notifications/${id}/read`);
    return data;
  },

  markAllAsRead: async () => {
    const { data } = await api.put('/notifications/read-all');
    return data;
  },

  deleteNotification: async (id: string) => {
    const { data } = await api.delete(`/notifications/${id}`);
    return data;
  },

  clearAll: async () => {
    const { data } = await api.delete('/notifications');
    return data;
  },
};
