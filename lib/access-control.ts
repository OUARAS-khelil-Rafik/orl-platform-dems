export type UserRole = 'admin' | 'user' | 'vip' | 'vip_plus';
export type SubscriptionApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface UserProfileLike {
  uid: string;
  email: string;
  role: UserRole;
  subscriptionEndDate?: string;
  subscriptionApprovalStatus?: SubscriptionApprovalStatus;
  purchasedVideos?: string[];
  purchasedPacks?: string[];
  blockedVideoIds?: string[];
  isBlocked?: boolean;
}

export interface VideoAccessTarget {
  id: string;
  isFreeDemo: boolean;
  packId?: string;
}

export const isSubscriptionActive = (
  profile: Pick<UserProfileLike, 'role' | 'subscriptionEndDate' | 'subscriptionApprovalStatus'>,
): boolean => {
  if (profile.role !== 'vip_plus') {
    return false;
  }

  if (profile.subscriptionApprovalStatus === 'rejected' || profile.subscriptionApprovalStatus === 'pending') {
    return false;
  }

  if (!profile.subscriptionEndDate) {
    return false;
  }

  return new Date(profile.subscriptionEndDate) > new Date();
};

export const canAccessVideo = (
  video: VideoAccessTarget,
  profile: UserProfileLike | null,
): boolean => {
  if (video.isFreeDemo) {
    return true;
  }

  if (!profile) {
    return false;
  }

  if (profile.isBlocked) {
    return false;
  }

  if (profile.blockedVideoIds?.includes(video.id)) {
    return false;
  }

  if (profile.role === 'admin') {
    return true;
  }

  if (profile.role === 'vip_plus') {
    return true;
  }

  if (isSubscriptionActive(profile)) {
    return true;
  }

  if (video.packId && profile.purchasedPacks?.includes(video.packId)) {
    return true;
  }

  return profile.purchasedVideos?.includes(video.id) ?? false;
};

export const hasPendingSubscriptionApproval = (
  profile: Pick<UserProfileLike, 'subscriptionApprovalStatus' | 'role'>,
): boolean => {
  return profile.role === 'vip_plus' && profile.subscriptionApprovalStatus === 'pending';
};
