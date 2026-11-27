import { describe, expect, it } from 'vitest';
import { canAccessVideo, isVipPlus, isVipPlusActive } from '@/lib/security/access-control';

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

  it('unlocks every video for vip_plus', () => {
    const profile = {
      uid: 'u-vip',
      email: 'vip@test.local',
      role: 'vip_plus' as const,
      subscriptionApprovalStatus: 'approved' as const,
      subscriptionEndDate: '2099-01-01T00:00:00.000Z',
      purchasedVideos: [],
      purchasedPacks: [],
    };

    expect(canAccessVideo(paidVideo, profile)).toBe(true);
    expect(canAccessVideo({ id: 'video-2', isFreeDemo: false }, profile)).toBe(true);
  });

  describe('isVipPlus', () => {
    it('returns false for null / undefined profile', () => {
      expect(isVipPlus(null)).toBe(false);
      expect(isVipPlus(undefined)).toBe(false);
    });

    it('returns true when role is vip_plus', () => {
      expect(isVipPlus({ role: 'vip_plus' as const })).toBe(true);
    });

    it('returns false for other roles', () => {
      expect(isVipPlus({ role: 'user' as const })).toBe(false);
      expect(isVipPlus({ role: 'vip' as const })).toBe(false);
      expect(isVipPlus({ role: 'admin' as const })).toBe(false);
    });
  });

  describe('isVipPlusActive', () => {
    const baseProfile = {
      uid: 'u-vip',
      email: 'vip@test.local',
      purchasedVideos: [],
      purchasedPacks: [],
    };

    it('returns false for null / undefined profile', () => {
      expect(isVipPlusActive(null)).toBe(false);
      expect(isVipPlusActive(undefined)).toBe(false);
    });

    it('returns false when role is not vip_plus', () => {
      expect(isVipPlusActive({ ...baseProfile, role: 'user' as const, subscriptionApprovalStatus: 'approved', subscriptionEndDate: '2099-01-01' })).toBe(false);
      expect(isVipPlusActive({ ...baseProfile, role: 'admin' as const, subscriptionApprovalStatus: 'approved', subscriptionEndDate: '2099-01-01' })).toBe(false);
    });

    it('returns false when subscription is pending', () => {
      expect(isVipPlusActive({ ...baseProfile, role: 'vip_plus' as const, subscriptionApprovalStatus: 'pending', subscriptionEndDate: '2099-01-01' })).toBe(false);
    });

    it('returns false when subscription is rejected', () => {
      expect(isVipPlusActive({ ...baseProfile, role: 'vip_plus' as const, subscriptionApprovalStatus: 'rejected', subscriptionEndDate: '2099-01-01' })).toBe(false);
    });

    it('returns false when subscription end date is missing', () => {
      expect(isVipPlusActive({ ...baseProfile, role: 'vip_plus' as const, subscriptionApprovalStatus: 'approved', subscriptionEndDate: undefined })).toBe(false);
    });

    it('returns false when subscription is expired', () => {
      expect(isVipPlusActive({ ...baseProfile, role: 'vip_plus' as const, subscriptionApprovalStatus: 'approved', subscriptionEndDate: '2020-01-01T00:00:00.000Z' })).toBe(false);
    });

    it('returns true when vip_plus subscription is approved and not expired', () => {
      expect(isVipPlusActive({ ...baseProfile, role: 'vip_plus' as const, subscriptionApprovalStatus: 'approved', subscriptionEndDate: '2099-01-01T00:00:00.000Z' })).toBe(true);
    });
  });
});
