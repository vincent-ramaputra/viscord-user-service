import { RelationshipType } from '../enums/relationship-type.enum';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';

export class RelationshipResponseDTO {
  id: string;

  user: UserProfileResponseDTO;

  type: RelationshipType;

  createdAt: Date;

  updatedAt: Date;
}
