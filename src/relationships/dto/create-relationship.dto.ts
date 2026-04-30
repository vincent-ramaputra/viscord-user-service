import { AutoMap } from '@automapper/classes';

export class CreateRelationshipDto {
  @AutoMap()
  username: string;
}
