import api from './api';

export interface ChatMessage {
  _id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export const chatService = {
  getChat: async (rideId: string): Promise<ChatMessage[]> => {
    const { data } = await api.get(`/chat/${rideId}`);
    return data.messages;
  },

  sendMessage: async (rideId: string, text: string): Promise<ChatMessage> => {
    const { data } = await api.post(`/chat/${rideId}/message`, { content: text });
    return data.message;
  },
};
