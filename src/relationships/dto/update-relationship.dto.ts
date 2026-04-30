import { PartialType } from '@nestjs/mapped-types';
import { CreateRelationshipDto } from './create-relationship.dto';
import { RelationshipType } from '../enums/relationship-type.enum';

export class UpdateRelationshipDto extends PartialType(CreateRelationshipDto) {
  type: RelationshipType;
}
