import { AutoMap } from '@automapper/classes';

export class UserIdentityResponseDTO {
  @AutoMap()
  id: string;

  @AutoMap()
  email: string;

  @AutoMap()
  username: string;

  @AutoMap()
  dateOfBirth: Date;
}
