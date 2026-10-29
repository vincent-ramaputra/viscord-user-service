import { IsEnum, IsInt } from 'class-validator';
import { RelationshipType } from '../enums/relationship-type.enum';

export class UpdateRelationshipDto {
  @IsInt()
  @IsEnum(RelationshipType)
  type: RelationshipType;
}
