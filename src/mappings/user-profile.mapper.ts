import { CreateUserProfileDto } from 'src/user-profiles/dto/create-user-profile.dto';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';
import { UserProfile } from 'src/user-profiles/entities/user-profile.entity';

export function toUserProfileEntity(dto: CreateUserProfileDto): UserProfile {
  const entity = new UserProfile();
  entity.id = dto.id;
  entity.username = dto.username;
  entity.displayName = dto.displayName;
  return entity;
}

export function toUserProfileResponseDTO(
  entity: UserProfile,
): UserProfileResponseDTO {
  const dto = new UserProfileResponseDTO();
  dto.id = entity.id;
  dto.displayName = entity.displayName;
  dto.username = entity.username;
  dto.pronouns = entity.pronouns;
  dto.bio = entity.bio;
  dto.status = entity.status;
  dto.avatarURL = entity.avatarURL;
  dto.defaultAvatarURL = entity.defaultAvatarURL;
  dto.createdAt = entity.createdAt;
  dto.updatedAt = entity.updatedAt;
  return dto;
}

export function toUserProfileEntityFromResponse(
  dto: UserProfileResponseDTO,
): UserProfile {
  const entity = new UserProfile();
  entity.id = dto.id;
  entity.displayName = dto.displayName;
  entity.username = dto.username;
  entity.pronouns = dto.pronouns;
  entity.bio = dto.bio;
  entity.status = dto.status;
  entity.avatarURL = dto.avatarURL;
  entity.defaultAvatarURL = dto.defaultAvatarURL;
  entity.createdAt = dto.createdAt;
  entity.updatedAt = dto.updatedAt;
  return entity;
}
