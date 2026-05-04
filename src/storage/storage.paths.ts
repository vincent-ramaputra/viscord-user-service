export const StoragePaths = {
  DEFAULT_AVATAR: '/assets/avatars',
  USER_AVATAR: '/avatars',
};

export type StoragePath = (typeof StoragePaths)[keyof typeof StoragePaths];
