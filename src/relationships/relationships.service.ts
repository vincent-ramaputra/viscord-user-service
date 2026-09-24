import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Relationship } from './entities/relationship.entity';
import { DataSource, Repository } from 'typeorm';
import { UserProfilesService } from 'src/user-profiles/user-profiles.service';
import { Result } from 'src/interfaces/result.interface';
import { RelationshipType } from './enums/relationship-type.enum';
import { RelationshipResponseDTO } from './dto/relationship-response.dto';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { toRelationshipResponseDTO } from 'src/mappings/relationship.mapper';
import { Payload } from 'src/interfaces/payload.dto';
import {
  GATEWAY_QUEUE,
  USER_PRESENCE_UPDATE_EVENT,
} from 'src/constants/events';
import { UserStatus } from 'src/user-profiles/enums/user-status.enum';
import { UserPresenceUpdateDTO } from 'src/presence/dto/user-presence-update.dto';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';
import { OutboxService } from 'src/outbox/outbox.service';
import { OutboxEvent } from 'src/outbox/enums/outbox-event.enum';

@Injectable()
export class RelationshipsService {
  private readonly logger = new Logger(RelationshipsService.name);
  private gatewayMQ: ClientProxy;

  constructor(
    @Inject(forwardRef(() => UserProfilesService))
    private readonly userProfilesService: UserProfilesService,
    private readonly outboxService: OutboxService,
    @InjectRepository(Relationship)
    private readonly relationshipRepository: Repository<Relationship>,
    private readonly dataSource: DataSource,
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
    userId: string,
    dto: CreateRelationshipDto,
  ): Promise<Result<RelationshipResponseDTO>> {
    const recipientProfileResponse =
      await this.userProfilesService.getProfileByUsername(dto.username);

    if (recipientProfileResponse.status != HttpStatus.OK) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Hm, didn't work. Double check that the username is correct.",
        data: null,
      };
    }

    const recipient = recipientProfileResponse.data;

    if (recipient.id === userId) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Hm, didn't work. Double check that the username is correct.",
        data: null,
      };
    }

    const existingRelationship = await this.relationshipRepository.findOne({
      where: [
        { senderId: userId, recipientId: recipient.id },
        { recipientId: userId, senderId: recipient.id },
      ],
    });

    if (!existingRelationship) {
      const senderProfileResponse =
        await this.userProfilesService.getById(userId);
      if (senderProfileResponse.status != HttpStatus.OK) {
        this.logger.error(
          { err: senderProfileResponse.message },
          'Unable to retrieve sender data',
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Unable to retrieve user data',
          data: null,
        };
      }

      const relationship: Relationship = new Relationship();
      relationship.senderId = userId;
      relationship.recipientId = recipient.id;
      relationship.type = RelationshipType.Pending;

      try {
        await this.dataSource.transaction(async (manager) => {
          await manager.save(relationship);

          const payload: RelationshipResponseDTO =
            toRelationshipResponseDTO(relationship);
          payload.user = senderProfileResponse.data;
          payload.type = RelationshipType.PendingReceived;

          await this.outboxService.pushEvent(
            {
              event: OutboxEvent.FriendRequestSent,
              data: {
                recipients: [relationship.recipientId],
                data: payload,
              } as Payload<RelationshipResponseDTO>,
            },
            manager,
          );
        });
      } catch (error) {
        this.logger.error(
          { err: error.message },
          'failed to save relationship',
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unknown error occurred',
          data: null,
        };
      }

      const responseDTO: RelationshipResponseDTO =
        toRelationshipResponseDTO(relationship);
      responseDTO.user = recipient;
      return {
        status: HttpStatus.OK,
        message: 'Request sent successfully',
        data: responseDTO,
      };
    }

    if (existingRelationship.type === RelationshipType.Friends) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "You're already friends with that user!",
        data: null,
      };
    } else if (existingRelationship.type === RelationshipType.Pending) {
      if (existingRelationship.recipientId === userId) {
        const response = await this.acceptRequest(userId, existingRelationship);
        if (response.status !== HttpStatus.NO_CONTENT) {
          return response;
        }

        return {
          status: HttpStatus.OK,
          message: 'Request accepted successfully',
          data: null,
        };
      } else {
        return {
          status: HttpStatus.OK,
          message: 'Request sent successfully',
          data: null,
        };
      }
    } else if (
      existingRelationship.type === RelationshipType.Blocked &&
      existingRelationship.senderId === userId
    ) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'You need to unblock this user first.',
        data: null,
      };
    }
    return {
      status: HttpStatus.BAD_REQUEST,
      message: "Hm, didn't work. Double check that the username is correct.",
      data: null,
    };
  }

  async findAll(userId: string): Promise<Result<RelationshipResponseDTO[]>> {
    if (!userId || userId.length === 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid user id',
        data: null,
      };
    }

    const relationships: Relationship[] =
      await this.relationshipRepository.find({
        where: [{ senderId: userId }, { recipientId: userId }],
      });

    const filtered = relationships.filter(
      (rel) => rel.type !== RelationshipType.Blocked || rel.senderId === userId,
    );

    const profilesResponse = await this.userProfilesService.getUserProfiles(
      filtered.map((rel) =>
        rel.senderId === userId ? rel.recipientId : rel.senderId,
      ),
    );
    if (profilesResponse.status !== HttpStatus.OK || !profilesResponse.data) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        data: null,
        message: 'Failed retrieving user profiles',
      };
    }

    const profilesById: Map<string, UserProfileResponseDTO> = new Map(
      profilesResponse.data.map((p) => [p.id, p]),
    );
    const relationshipDTOs: RelationshipResponseDTO[] = filtered.map((rel) => {
      const otherUserId =
        rel.senderId !== userId ? rel.senderId : rel.recipientId;
      const responseDTO = toRelationshipResponseDTO(rel);
      responseDTO.user = profilesById.get(otherUserId) ?? null;
      responseDTO.type =
        rel.type === RelationshipType.Pending
          ? rel.senderId === userId
            ? RelationshipType.Pending
            : RelationshipType.PendingReceived
          : rel.type;

      return responseDTO;
    });

    return {
      status: HttpStatus.OK,
      message: 'Relationships retrieved successfully',
      data: relationshipDTOs,
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRelationshipDto,
  ): Promise<Result<null>> {
    if (!id || id.length === 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid id',
        data: null,
      };
    }

    const relationship: Relationship =
      await this.relationshipRepository.findOneBy({ id: id });

    if (!relationship) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Relationship not found',
        data: null,
      };
    }
    if (relationship.senderId != userId && relationship.recipientId != userId) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'You cannot perform this action.',
        data: null,
      };
    }

    if (dto.type === RelationshipType.Blocked) {
      return this.blockUserUpdate(userId, relationship);
    } else if (dto.type === RelationshipType.Friends) {
      return this.acceptRequest(userId, relationship);
    } else {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid request',
        data: null,
      };
    }
  }

  public async blockUser(
    userId: string,
    blockedUserId: string,
  ): Promise<Result<null>> {
    if (!blockedUserId || blockedUserId.length === 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid id',
        data: null,
      };
    }

    const rel = await this.relationshipRepository.findOne({
      where: [
        { senderId: userId, recipientId: blockedUserId },
        { senderId: blockedUserId, recipientId: userId },
      ],
    });

    if (rel) {
      return this.blockUserUpdate(userId, rel);
    }

    const relationship = new Relationship();
    relationship.senderId = userId;
    relationship.recipientId = blockedUserId;
    relationship.type = RelationshipType.Blocked;

    await this.relationshipRepository.save(relationship);

    return {
      status: HttpStatus.NO_CONTENT,
      message: 'User blocked successfully',
      data: null,
    };
  }

  private async blockUserUpdate(
    userId: string,
    relationship: Relationship,
  ): Promise<Result<null>> {
    relationship.type = RelationshipType.Blocked;

    const blockedUserId: string =
      relationship.senderId === userId
        ? relationship.recipientId
        : relationship.senderId;

    relationship.senderId = userId;
    relationship.recipientId = blockedUserId;

    await this.relationshipRepository.save(relationship);

    return {
      status: HttpStatus.NO_CONTENT,
      message: 'User blocked successfully',
      data: null,
    };
  }

  private async acceptRequest(
    userId: string,
    relationship: Relationship,
  ): Promise<Result<null>> {
    if (relationship.type !== RelationshipType.Pending) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Cannot befriend this user',
        data: null,
      };
    }

    if (userId !== relationship.recipientId) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Invalid action',
        data: null,
      };
    }

    const recipientResponse = await this.userProfilesService.getById(userId);

    if (recipientResponse.status !== HttpStatus.OK) {
      this.logger.error(
        { err: recipientResponse.message, userId },
        'failed retrieving user profile',
      );
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unknown error occurred',
        data: null,
      };
    }
    try {
      await this.dataSource.transaction(async (manager) => {
        relationship.type = RelationshipType.Friends;
        await manager.save(relationship);

        const payload = toRelationshipResponseDTO(relationship);
        payload.user = recipientResponse.data;

        await this.outboxService.pushEvent(
          {
            event: OutboxEvent.FriendRequestAccepted,
            data: {
              recipients: [relationship.senderId],
              data: payload,
            } as Payload<RelationshipResponseDTO>,
          },
          manager,
        );
      });
    } catch (error) {
      this.logger.error(
        { err: error.message },
        'Failed to accept friend request',
      );

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to accept friend request',
        data: null,
      };
    }

    return {
      status: HttpStatus.NO_CONTENT,
      message: 'Friend request accepted successfully',
      data: null,
    };
  }

  async remove(userId: string, id: string): Promise<Result<null>> {
    if (!id || id.length === 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid id',
        data: null,
      };
    }
    let relationship: Relationship;
    try {
      relationship = await this.relationshipRepository.findOneBy({ id: id });

      if (
        !relationship ||
        (relationship.senderId !== userId &&
          relationship.recipientId !== userId)
      ) {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid request',
          data: null,
        };
      }
      if (
        relationship.type === RelationshipType.Blocked &&
        relationship.senderId != userId
      ) {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid request',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(
        { err: error.message },
        'failed to find relationship for deletion',
      );
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'An error occurred when deleting relationship',
        data: null,
      };
    }

    const senderResponse = await this.userProfilesService.getById(userId);
    if (senderResponse.status !== HttpStatus.OK) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unknown error occurred',
        data: null,
      };
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(Relationship, { id: relationship.id });

        const payload = toRelationshipResponseDTO(relationship);
        payload.user = senderResponse.data;
        await this.outboxService.pushEvent(
          {
            event: OutboxEvent.FriendRemoved,
            data: {
              recipients: [
                relationship.senderId !== userId
                  ? relationship.senderId
                  : relationship.recipientId,
              ],
              data: payload,
            },
          },
          manager,
        );
      });
    } catch (error) {
      this.logger.error(
        { err: error.message },
        'failed to delete relationship',
      );
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An error occurred when deleting relationship',
        data: null,
      };
    }

    return {
      status: HttpStatus.NO_CONTENT,
      message: 'Relationship deleted',
      data: null,
    };
  }

  async onUserOnline(userId: string) {
    if (!userId || userId.length === 0) return;

    const userResponse = await this.userProfilesService.getById(userId);
    if (
      userResponse.status !== HttpStatus.OK ||
      userResponse.data.status === UserStatus.Invisible
    )
      return;

    this.emitUserOnline(userId);
  }

  async onUserOffline(userId: string) {
    if (!userId || userId.length === 0) return;

    const userResponse = await this.userProfilesService.getById(userId);
    if (
      userResponse.status !== HttpStatus.OK ||
      userResponse.data.status === UserStatus.Invisible
    )
      return;

    this.emitUserOffline(userId);
  }

  emitUserOffline(userId: string) {
    try {
      this.gatewayMQ.emit(USER_PRESENCE_UPDATE_EVENT, {
        recipients: [],
        targetIds: [userId],
        data: {
          userId,
          isOnline: false,
        },
      } as Payload<UserPresenceUpdateDTO>);
    } catch (error) {
      this.logger.error(
        { err: error.message },
        'failed to emit user offline event',
      );
    }
  }

  emitUserOnline(userId: string) {
    try {
      this.gatewayMQ.emit(USER_PRESENCE_UPDATE_EVENT, {
        recipients: [],
        targetIds: [userId],
        data: {
          userId,
          isOnline: true,
        },
      } as Payload<UserPresenceUpdateDTO>);
    } catch (error) {
      this.logger.error(
        { err: error.message },
        'failed to emit user online event',
      );
    }
  }

  async onGetVisibleUsers(userId: string): Promise<Result<string[]>> {
    if (!userId || userId.length === 0) return;

    const friends: Relationship[] = await this.relationshipRepository.findBy([
      { senderId: userId, type: RelationshipType.Friends },
      { recipientId: userId, type: RelationshipType.Friends },
    ]);
    const userIds = [
      ...friends.map((rel) =>
        rel.senderId === userId ? rel.recipientId : rel.senderId,
      ),
      userId,
    ];
    const userProfilesResponse =
      await this.userProfilesService.getUserProfiles(userIds);
    if (userProfilesResponse.status !== HttpStatus.OK) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: '',
        data: [],
      };
    }

    const payload = {
      status: HttpStatus.OK,
      message: '',
      data: userIds.filter((friendId) => {
        return (
          userProfilesResponse.data.find((up) => up.id === friendId)?.status !==
          UserStatus.Invisible
        );
      }),
    };

    return payload;
  }
}
