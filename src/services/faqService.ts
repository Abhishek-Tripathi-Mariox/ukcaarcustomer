import api from './api';

export interface Faq {
  _id: string;
  question: string;
  answer: string;
  order?: number;
}

/**
 * Admin-managed Help & Support FAQs. The backend returns only the entries
 * flagged for the customer app (audience 'user' or 'both'), already sorted
 * by the admin-defined order.
 */
export const faqService = {
  list: async (): Promise<Faq[]> => {
    const { data } = await api.get<{
      success: boolean;
      data: { faqs: Faq[] };
    }>('/support/faqs');
    return data?.data?.faqs ?? [];
  },
};
