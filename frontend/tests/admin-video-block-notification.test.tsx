import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import React from 'react';

// Mock Firebase operations
const mockNotifications: Array<{
  userId: string;
  type: string;
  title: string;
  description: string;
  targetHref: string;
  createdAt: string;
}> = [];

const mockVideos = [
  {
    id: 'video-1',
    title: 'Otologie Avancée',
  },
  {
    id: 'video-2',
    title: 'Rhinologie Clinique',
  },
];

const mockUsers = [
  {
    id: 'vip-user-1',
    email: 'vip@test.com',
    role: 'vip',
    blockedVideoIds: [],
    purchasedVideos: ['video-1', 'video-2'],
  },
  {
    id: 'vip-plus-user-1',
    email: 'vip-plus@test.com',
    role: 'vip_plus',
    blockedVideoIds: [],
    purchasedVideos: ['video-1'],
  },
  {
    id: 'regular-user-1',
    email: 'regular@test.com',
    role: 'user',
    blockedVideoIds: [],
    purchasedVideos: [],
  },
];

// Simulating the admin's handleBlockVideoForUser function
const simulateHandleBlockVideoForUser = async (
  user: (typeof mockUsers)[0],
  videoId: string,
) => {
  const blockedSet = new Set(user.blockedVideoIds || []);
  const wasBlocked = blockedSet.has(videoId);
  if (wasBlocked) {
    blockedSet.delete(videoId);
  } else {
    blockedSet.add(videoId);
  }

  const isNowBlocked = !wasBlocked;
  user.blockedVideoIds = Array.from(blockedSet);

  // Create notification
  const videoTitle =
    mockVideos.find((video) => video.id === videoId)?.title ||
    `Video ${videoId}`;
  const payload = {
    userId: user.id,
    type: 'video',
    title: isNowBlocked ? 'Video bloquee' : 'Video debloquee',
    description: isNowBlocked
      ? `L'admin a bloque votre acces a "${videoTitle}".`
      : `L'admin a debloque votre acces a "${videoTitle}".`,
    targetHref: `/videos/${videoId}`,
  };

  try {
    mockNotifications.push({
      ...payload,
      createdAt: new Date().toISOString(),
    });
  } catch (notificationError) {
    console.error(
      'Error creating video block notification:',
      notificationError,
    );
  }

  return { isNowBlocked, videoTitle };
};

describe('Admin Video Block/Unblock Notification', () => {
  beforeEach(() => {
    mockNotifications.length = 0;
    mockUsers.forEach((u) => {
      u.blockedVideoIds = [];
    });
  });

  describe('VIP User Notifications', () => {
    it('should create a notification when admin blocks a video for VIP user', async () => {
      const vipUser = mockUsers[0]; // vip user
      const initialNotificationCount = mockNotifications.length;

      await simulateHandleBlockVideoForUser(vipUser, 'video-1');

      expect(mockNotifications.length).toBe(initialNotificationCount + 1);
      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification.userId).toBe(vipUser.id);
      expect(notification.type).toBe('video');
      expect(notification.title).toBe('Video bloquee');
      expect(notification.description).toContain('L\'admin a bloque');
      expect(notification.description).toContain('Otologie Avancée');
      expect(notification.targetHref).toBe('/videos/video-1');
    });

    it('should create a notification when admin unblocks a video for VIP user', async () => {
      const vipUser = mockUsers[0];
      vipUser.blockedVideoIds = ['video-1'];

      const initialNotificationCount = mockNotifications.length;
      await simulateHandleBlockVideoForUser(vipUser, 'video-1');

      expect(mockNotifications.length).toBe(initialNotificationCount + 1);
      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification.title).toBe('Video debloquee');
      expect(notification.description).toContain('L\'admin a debloque');
    });

    it('should include video title in notification for VIP user', async () => {
      const vipUser = mockUsers[0];

      await simulateHandleBlockVideoForUser(vipUser, 'video-2');

      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification.description).toContain('Rhinologie Clinique');
    });

    it('should not block an already blocked video twice', async () => {
      const vipUser = mockUsers[0];
      vipUser.blockedVideoIds = ['video-1'];

      const initialCount = vipUser.blockedVideoIds.length;
      await simulateHandleBlockVideoForUser(vipUser, 'video-1');

      // After second block attempt, it should unblock
      expect(vipUser.blockedVideoIds.length).toBe(initialCount - 1);
      expect(vipUser.blockedVideoIds).not.toContain('video-1');
    });
  });

  describe('VIP Plus User Notifications', () => {
    it('should create a notification when admin blocks a video for VIP_PLUS user', async () => {
      const vipPlusUser = mockUsers[1];

      await simulateHandleBlockVideoForUser(vipPlusUser, 'video-1');

      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification.userId).toBe(vipPlusUser.id);
      expect(notification.title).toBe('Video bloquee');
    });
  });

  describe('Regular User Notifications', () => {
    it('should create a notification when admin blocks a video for regular user', async () => {
      const regularUser = mockUsers[2];

      await simulateHandleBlockVideoForUser(regularUser, 'video-1');

      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification.userId).toBe(regularUser.id);
      expect(notification.type).toBe('video');
    });
  });

  describe('Notification Properties', () => {
    it('should have correct notification payload structure', async () => {
      const vipUser = mockUsers[0];

      await simulateHandleBlockVideoForUser(vipUser, 'video-1');

      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification).toHaveProperty('userId');
      expect(notification).toHaveProperty('type');
      expect(notification).toHaveProperty('title');
      expect(notification).toHaveProperty('description');
      expect(notification).toHaveProperty('targetHref');
      expect(notification).toHaveProperty('createdAt');
    });

    it('should have a valid ISO timestamp', async () => {
      const vipUser = mockUsers[0];

      await simulateHandleBlockVideoForUser(vipUser, 'video-1');

      const notification = mockNotifications[mockNotifications.length - 1];
      const timestamp = new Date(notification.createdAt);
      expect(timestamp.getTime()).toBeGreaterThan(0);
      expect(!isNaN(timestamp.getTime())).toBe(true);
    });

    it('should handle missing video title gracefully', async () => {
      const vipUser = mockUsers[0];

      await simulateHandleBlockVideoForUser(vipUser, 'unknown-video-id');

      const notification = mockNotifications[mockNotifications.length - 1];
      expect(notification.description).toContain('Video unknown-video-id');
    });
  });

  describe('User State Updates', () => {
    it('should toggle blocked video IDs correctly', async () => {
      const vipUser = mockUsers[0];

      // Block video-1
      await simulateHandleBlockVideoForUser(vipUser, 'video-1');
      expect(vipUser.blockedVideoIds).toContain('video-1');

      // Unblock video-1
      await simulateHandleBlockVideoForUser(vipUser, 'video-1');
      expect(vipUser.blockedVideoIds).not.toContain('video-1');
    });

    it('should handle multiple blocked videos', async () => {
      const vipUser = mockUsers[0];

      await simulateHandleBlockVideoForUser(vipUser, 'video-1');
      await simulateHandleBlockVideoForUser(vipUser, 'video-2');

      expect(vipUser.blockedVideoIds).toContain('video-1');
      expect(vipUser.blockedVideoIds).toContain('video-2');
      expect(vipUser.blockedVideoIds.length).toBe(2);
    });
  });

  describe('Notification Display Requirements', () => {
    it('should ensure notification is created for any user role', async () => {
      for (const user of mockUsers) {
        mockNotifications.length = 0;

        await simulateHandleBlockVideoForUser(user, 'video-1');

        expect(mockNotifications.length).toBe(1);
        expect(mockNotifications[0].userId).toBe(user.id);
      }
    });

    it('should have descriptive messages for UI display', async () => {
      const vipUser = mockUsers[0];

      await simulateHandleBlockVideoForUser(vipUser, 'video-1');
      const notification = mockNotifications[mockNotifications.length - 1];

      // Check that messages are in French as per app locale
      expect(notification.title).toMatch(/bloque/i);
      expect(notification.description).toMatch(/admin/i);
    });
  });
});
