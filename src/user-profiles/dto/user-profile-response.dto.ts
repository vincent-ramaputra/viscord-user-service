import { AutoMap } from '@automapper/classes';
import { UserStatus } from '../enums/user-status.enum';

export class UserProfileResponseDTO {
  @AutoMap()
  id: string;

  @AutoMap()
  displayName: string;

  @AutoMap()
  username: string;

  @AutoMap()
  pronouns?: string;

  @AutoMap()
  bio?: string;

  @AutoMap()
  status: UserStatus;

  @AutoMap()
  avatarURL?: string;

  @AutoMap()
  defaultAvatarURL?: string;

  @AutoMap()
  createdAt: Date;

  @AutoMap()
  updatedAt: Date;
}
