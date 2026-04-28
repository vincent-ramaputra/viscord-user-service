import { AutoMap } from '@automapper/classes';
import { RelationshipType } from '../enums/relationship-type.enum';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';

export class RelationshipResponseDTO {
  @AutoMap()
  id: string;

  user: UserProfileResponseDTO;

  @AutoMap()
  type: RelationshipType;

  @AutoMap()
  createdAt: Date;

  @AutoMap()
  updatedAt: Date;
}
