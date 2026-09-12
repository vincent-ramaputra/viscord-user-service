import { Relationship } from 'src/relationships/entities/relationship.entity';
import { RelationshipResponseDTO } from 'src/relationships/dto/relationship-response.dto';

export function toRelationshipResponseDTO(
  entity: Relationship,
): RelationshipResponseDTO {
  const dto = new RelationshipResponseDTO();
  dto.id = entity.id;
  dto.type = entity.type;
  dto.createdAt = entity.createdAt;
  dto.updatedAt = entity.updatedAt;
  return dto;
}
