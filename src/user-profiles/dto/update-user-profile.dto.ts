import { AutoMap } from '@automapper/classes';

export class UpdateUserProfileDto {
  @AutoMap()
  id: string;

  @AutoMap()
  displayName: string;

  @AutoMap()
  pronouns?: string;

  @AutoMap()
  bio?: string;
}
