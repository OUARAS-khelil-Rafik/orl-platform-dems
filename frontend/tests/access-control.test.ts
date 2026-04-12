import { describe, expect, it } from 'vitest';
import { canAccessVideo } from '@/lib/security/access-control';

describe('access-control', () => {
  const paidVideo = {
    id: 'video-1',
    isFreeDemo: false,
    packId: 'otologie',
  };

  const freeVideo = {
    id: 'video-demo',
    isFreeDemo: true,
    packId: '',
  };

  it('allows admin access', () => {
    const profile = {
      uid: 'u1',
      email: 'admin@test.local',
      role: 'admin' as const,
      subscriptionApprovalStatus: 'none' as const,
      subscriptionEndDate: undefined,
      purchasedVideos: [],
      purchasedPacks: [],
    };

    expect(canAccessVideo(paidVideo, profile)).toBe(true);
  });

  it('allows vip_plus active subscription access', () => {
    const profile = {
      uid: 'u2',
      email: 'vip@test.local',
      role: 'vip_plus' as const,
      subscriptionApprovalStatus: 'approved' as const,
      subscriptionEndDate: '2099-01-01T00:00:00.000Z',
      purchasedVideos: [],
      purchasedPacks: [],
    };

    expect(canAccessVideo(paidVideo, profile)).toBe(true);
  });

  it('denies standard user on paid video without purchase', () => {
    const profile = {
      uid: 'u3',
      email: 'user@test.local',
      role: 'user' as const,
      subscriptionApprovalStatus: 'none' as const,
      purchasedVideos: [],
      purchasedPacks: [],
    };

    expect(canAccessVideo(paidVideo, profile)).toBe(false);
  });

  it('always allows free demo video', () => {
    expect(canAccessVideo(freeVideo, null)).toBe(true);
  });
});
