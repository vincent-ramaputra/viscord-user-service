import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';

export class UserResponseDTO {
  id: string;

  email: string;

  dateOfBirth: Date;

  profile: UserProfileResponseDTO;
}
