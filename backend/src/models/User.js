import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    passwordLoginEnabled: { type: Boolean, default: true },
    displayName: { type: String, required: true },
    photoURL: { type: String, default: '' },
    googleAuth: {
      sub: { type: String, default: '', index: true },
      email: { type: String, default: '' },
      picture: { type: String, default: '' },
      connectedAt: { type: String, default: '' },
    },
    role: {
      type: String,
      enum: ['admin', 'user', 'vip', 'vip_plus'],
      default: 'user',
      index: true,
    },
    subscriptionEndDate: { type: String },
    subscriptionApprovalStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    doctorSpecialty: { type: String },
    phoneNumber: { type: String },
    purchasedVideos: { type: [String], default: [] },
    purchasedPacks: { type: [String], default: [] },
    favoriteVideoIds: { type: [String], default: [] },
    importantVideoIds: { type: [String], default: [] },
    blockedVideoIds: { type: [String], default: [] },
    isBlocked: { type: Boolean, default: false },
    cloudinary: {
      cloudName: { type: String, default: '' },
      apiKey: { type: String, default: '' },
      apiSecret: { type: String, default: '' },
      updatedAt: { type: String },
    },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
