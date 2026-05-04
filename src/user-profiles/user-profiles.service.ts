import {
  Body,
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UserProfile } from './entities/user-profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Result } from 'src/interfaces/result.interface';
import { mapper } from 'src/mappings/mappers';
import { createMap } from '@automapper/core';
import { UserProfileResponseDTO } from './dto/user-profile-response.dto';
import { UpdateStatusDTO } from 'src/users/dto/update-status.dto';
import { StorageService } from 'src/storage/storage.service';
import { UpdateUsernameDTO } from 'src/users/dto/update-username.dto';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { GATEWAY_QUEUE, USER_PROFILE_UPDATE_EVENT } from 'src/constants/events';
import { Payload } from 'src/interfaces/payload.dto';
import { UserStatus } from './enums/user-status.enum';
import { RelationshipsService } from 'src/relationships/relationships.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { StoragePaths } from 'src/storage/storage.paths';

@Injectable()
export class UserProfilesService {
  private gatewayMQ: ClientProxy;
  constructor(
    private readonly storageService: StorageService,
    @Inject(forwardRef(() => RelationshipsService))
    private readonly relationshipsService: RelationshipsService,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
  ) {
    this.gatewayMQ = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [`amqp://${process.env.RMQ_HOST}:${process.env.RMQ_PORT}`],
        queue: GATEWAY_QUEUE,
        queueOptions: { durable: true },
      },
    });
  }

  async create(
    dto: CreateUserProfileDto,
  ): Promise<Result<UserProfileResponseDTO>> {
    const validationMessage = dto.validate();
    if (validationMessage) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: validationMessage,
        data: null,
      };
    }

    const defaultAvatarURLs: string[] = await this.storageService.getFiles(
      StoragePaths.DEFAULT_AVATAR,
    );
    const randomIndex = Math.floor(Math.random() * defaultAvatarURLs.length);

    const userProfile = mapper.map(dto, CreateUserProfileDto, UserProfile);
    userProfile.defaultAvatarURL = defaultAvatarURLs[randomIndex];
    userProfile.username = userProfile.username.toLowerCase();

    try {
      await this.userProfileRepository.save(userProfile);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).code === '23505'
      ) {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'This username is already used',
          data: null,
        };
      }
      throw error;
    }

    const userResponse = mapper.map(
      userProfile,
      UserProfile,
      UserProfileResponseDTO,
    );
    userResponse.defaultAvatarURL = this.storageService.toPublicURL(
      `${StoragePaths.DEFAULT_AVATAR}/${userResponse.defaultAvatarURL}`,
    );
    userResponse.avatarURL = this.storageService.toPublicURL(
      `${StoragePaths.USER_AVATAR}/${userResponse.avatarURL}`,
    );

    return {
      status: HttpStatus.CREATED,
      message: 'User profile created successfully',
      data: userResponse,
    };
  }

  async getById(id: string): Promise<Result<UserProfileResponseDTO>> {
    if (!id || id.length == 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'Invalid request',
      };
    }

    try {
      const userProfile: UserProfile =
        await this.userProfileRepository.findOneBy({ id: id });

      if (!userProfile) {
        return {
          status: HttpStatus.BAD_REQUEST,
          data: null,
          message: 'User not found',
        };
      }

      return {
        status: HttpStatus.OK,
        data: mapper.map(userProfile, UserProfile, UserProfileResponseDTO),
        message: 'User profile retrieved successfully',
      };
    } catch (error) {
      console.log(error);
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'An unknown error occurred',
      };
    }
  }

  async updateStatus(
    @Body(new ValidationPipe({ transform: true })) dto: UpdateStatusDTO,
  ): Promise<Result<null>> {
    const userResponse = await this.getById(dto.userId);

    if (userResponse.status != HttpStatus.OK) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: userResponse.message,
        data: null,
      };
    }
    const userProfile = mapper.map(
      userResponse.data,
      UserProfileResponseDTO,
      UserProfile,
    );

    try {
      const previousStatus = userProfile.status;

      userProfile.status = dto.status;
      await this.userProfileRepository.save(userProfile);

      if (dto.status === UserStatus.Invisible) {
        this.relationshipsService.emitUserOffline(dto.userId);
      } else if (previousStatus === UserStatus.Invisible) {
        this.relationshipsService.emitUserOnline(dto.userId);
      }
    } catch (error) {
      console.log(error);
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'An error occurred when updating user status',
      };
    }

    const profileDTO = mapper.map(
      userProfile,
      UserProfile,
      UserProfileResponseDTO,
    );

    const payload: Payload<UserProfileResponseDTO> = {
      recipients: [],
      targetIds: [profileDTO.id],
      data: profileDTO,
    };

    try {
      this.gatewayMQ.emit(USER_PROFILE_UPDATE_EVENT, payload);
    } catch (error) {
      console.error(error);
    }

    return {
      status: HttpStatus.OK,
      message: 'Status updated successfully',
      data: null,
    };
  }
  async updateUsername(
    id: string,
    dto: UpdateUsernameDTO,
  ): Promise<Result<any>> {
    const validateResult = dto.validate();
    if (validateResult) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: validateResult,
        data: null,
      };
    }

    await this.userProfileRepository.update(id, { username: dto.username });

    return {
      status: HttpStatus.OK,
      message: 'Username updated successfully',
      data: null,
    };
  }

  async getProfileByUsername(
    username: string,
  ): Promise<Result<UserProfileResponseDTO>> {
    if (!username || username.length == 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'Invalid request',
      };
    }

    try {
      const user: UserProfile = await this.userProfileRepository.findOne({
        where: { username: username },
      });

      if (!user) {
        return {
          status: HttpStatus.BAD_REQUEST,
          data: null,
          message: 'User not found',
        };
      }

      return {
        status: HttpStatus.OK,
        data: mapper.map(user, UserProfile, UserProfileResponseDTO),
        message: 'User profile retrieved successfully',
      };
    } catch (error) {
      console.log(error);
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'User not found',
      };
    }
  }

  async getUserProfiles(
    userIds: string[],
  ): Promise<Result<UserProfileResponseDTO[]>> {
    try {
      const userProfiles: UserProfile[] =
        await this.userProfileRepository.findBy({ id: In(userIds) });
      return {
        status: HttpStatus.OK,
        data: userProfiles.map((user) =>
          mapper.map(user, UserProfile, UserProfileResponseDTO),
        ),
        message: 'User profile retrieved successfully',
      };
    } catch (error) {
      console.log(error);
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'User not found',
      };
    }
  }

  async updateUserProfile(
    dto: UpdateUserProfileDto,
  ): Promise<Result<UserProfileResponseDTO>> {
    const profile = await this.userProfileRepository.findOneBy({ id: dto.id });

    if (!profile) {
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'Profile not found',
      };
    }

    profile.displayName =
      !dto.displayName || dto.displayName.length === 0
        ? profile.username
        : dto.displayName;
    profile.bio = dto.bio;
    profile.pronouns = dto.pronouns;

    try {
      await this.userProfileRepository.save(profile);
    } catch (error) {
      console.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        data: null,
        message: 'An error occurred while saving profile',
      };
    }

    const profileDTO = mapper.map(profile, UserProfile, UserProfileResponseDTO);

    try {
      this.gatewayMQ.emit(USER_PROFILE_UPDATE_EVENT, {
        recipients: [],
        targetIds: [profile.id],
        data: profileDTO,
      } as Payload<UserProfileResponseDTO>);
    } catch (error) {
      console.error(error);
    }

    return {
      status: HttpStatus.OK,
      data: profileDTO,
      message: 'User profile updated successfully',
    };
  }

  onModuleInit() {
    createMap(mapper, CreateUserProfileDto, UserProfile);
    createMap(mapper, UserProfile, UserProfileResponseDTO);
    createMap(mapper, UserProfileResponseDTO, UserProfile);
  }
}
