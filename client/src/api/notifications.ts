import api from './api';

export interface Notification {
  id: number;
  userId: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: number; // 0 or 1
  relatedWorkPackageId?: number;
  relatedProjectId?: number;
  workPackageName?: string;
  workPackageType?: string;
  projectNumber?: string;
  projectName?: string;
  createdAt: string;
}

export const notificationsAPI = {
  list: async (): Promise<Notification[]> => {
    const response = await api.get('/notifications');
    return response.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get('/notifications/unread-count');
    return response.data.count;
  },

  markAsRead: async (id: number): Promise<void> => {
    await api.put(`/notifications/${id}/read`);
  },

  markAllAsRead: async (): Promise<void> => {
    await api.put('/notifications/mark-all-read');
  },
};

