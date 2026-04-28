import { AutoMap } from '@automapper/classes';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';

export class UserResponseDTO {
  @AutoMap()
  id: string;

  @AutoMap()
  email: string;

  @AutoMap()
  dateOfBirth: Date;

  @AutoMap()
  profile: UserProfileResponseDTO;
}
