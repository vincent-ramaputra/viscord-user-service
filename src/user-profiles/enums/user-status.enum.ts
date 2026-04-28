export enum UserStatus {
  Offline = 0,
  Online = 1,
  Invisible = 2,
  Idle = 3,
  DoNotDisturb = 4,
}

export const UserStatusString = {
  [UserStatus.Offline]: 'Offline',
  [UserStatus.Online]: 'Online',
  [UserStatus.Invisible]: 'Invisible',
  [UserStatus.Idle]: 'Idle',
  [UserStatus.DoNotDisturb]: 'Do not disturb',
};
