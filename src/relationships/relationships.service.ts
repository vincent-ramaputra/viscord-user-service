import { forwardRef, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Relationship } from './entities/relationship.entity';
import { Repository } from 'typeorm';
import { UserProfilesService } from 'src/user-profiles/user-profiles.service';
import { Result } from 'src/interfaces/result.interface';
import { RelationshipType } from './enums/relationship-type.enum';
import { RelationshipResponseDTO } from './dto/relationship-response.dto';
import {
  ClientProxy,
  ClientProxyFactory,
  MessagePattern,
  Transport,
} from '@nestjs/microservices';
import { mapper } from 'src/mappings/mappers';
import { createMap } from '@automapper/core';
import { Payload } from 'src/interfaces/payload.dto';
import {
  FRIEND_ADDED_EVENT,
  FRIEND_REMOVED_EVENT,
  FRIEND_REQUEST_RECEIVED_EVENT,
  GATEWAY_QUEUE,
  GET_USERS_PRESENCE_RESPONSE_EVENT,
  USER_OFFLINE_EVENT,
  USER_ONLINE_EVENT,
  USER_PRESENCE_UPDATE_EVENT,
} from 'src/constants/events';
import { UserStatus } from 'src/user-profiles/enums/user-status.enum';
import { UserPresenceUpdateDTO } from 'src/presence/dto/user-presence-update.dto';

@Injectable()
export class RelationshipsService {
  private gatewayMQ: ClientProxy;

  constructor(
    @Inject(forwardRef(() => UserProfilesService))
    private readonly userProfilesService: UserProfilesService,
    @InjectRepository(Relationship)
    private readonly relationshipRepository: Repository<Relationship>,
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
    senderId: string,
    dto: CreateRelationshipDto,
  ): Promise<Result<RelationshipResponseDTO>> {
    const userProfileResponse =
      await this.userProfilesService.getProfileByUsername(dto.username);

    if (userProfileResponse.status != HttpStatus.OK) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Hm, didn't work. Double check that the username is correct.",
        data: null,
      };
    }

    const recipient = userProfileResponse.data;

    if (recipient.id === senderId) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Hm, didn't work. Double check that the username is correct.",
        data: null,
      };
    }

    const existingRelationship = await this.relationshipRepository.findOne({
      where: [
        { senderId: senderId, recipientId: recipient.id },
        { recipientId: senderId, senderId: recipient.id },
      ],
    });

    if (!existingRelationship) {
      const relationship: Relationship = new Relationship();
      relationship.senderId = senderId;
      relationship.recipientId = recipient.id;
      relationship.type = RelationshipType.Pending;

      try {
        await this.relationshipRepository.save(relationship);
      } catch (error) {
        console.log(error);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unknown error occurred',
          data: null,
        };
      }

      try {
        const sender = await this.userProfilesService.getById(senderId);
        const payload: RelationshipResponseDTO = mapper.map(
          relationship,
          Relationship,
          RelationshipResponseDTO,
        );

        payload.user = sender.data;
        payload.type = RelationshipType.PendingReceived;
        this.gatewayMQ.emit(FRIEND_REQUEST_RECEIVED_EVENT, {
          recipients: [relationship.recipientId],
          data: payload,
        } as Payload<RelationshipResponseDTO>);
      } catch (error) {
        console.log(error);
      }

      const dto: RelationshipResponseDTO = mapper.map(
        relationship,
        Relationship,
        RelationshipResponseDTO,
      );
      dto.user = recipient;
      return {
        status: HttpStatus.OK,
        message: 'Request sent successfully',
        data: dto,
      };
    }

    if (existingRelationship.type === RelationshipType.Friends) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "You're already friends with that user!",
        data: null,
      };
    } else if (existingRelationship.type === RelationshipType.Pending) {
      if (existingRelationship.senderId != senderId) {
        const response = await this.acceptRequest(existingRelationship);
        if (response.status !== HttpStatus.NO_CONTENT) {
          return {
            status: HttpStatus.BAD_REQUEST,
            message:
              "Hm, didn't work. Double check that the username is correct.",
            data: null,
          };
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
      existingRelationship.senderId === senderId
    ) {
      return this.update(senderId, existingRelationship.id, {
        type: RelationshipType.Friends,
      });
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

    const relationshipDTOs: RelationshipResponseDTO[] = await Promise.all(
      relationships
        .filter(
          (rel) =>
            rel.type !== RelationshipType.Blocked || rel.senderId === userId,
        )
        .map(async (relationship) => {
          const user = (
            await this.userProfilesService.getById(
              relationship.senderId !== userId
                ? relationship.senderId
                : relationship.recipientId,
            )
          ).data;
          return {
            id: relationship.id,
            type:
              relationship.type === RelationshipType.Pending
                ? relationship.senderId === userId
                  ? RelationshipType.Pending
                  : RelationshipType.PendingReceived
                : relationship.type,
            user: user,
            createdAt: relationship.createdAt,
            updatedAt: relationship.updatedAt,
          };
        }),
    );

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

    if (!dto || !dto.type) {
      dto = { type: RelationshipType.Friends };
    }

    const relationship: Relationship =
      await this.relationshipRepository.findOneBy({ id: id });

    if (
      !relationship ||
      (relationship.senderId != userId && relationship.recipientId != userId)
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Relationship not found',
        data: null,
      };
    }

    if (dto.type === RelationshipType.Blocked) {
      return this.blockUserUpdate(userId, relationship);
    } else if (dto.type === RelationshipType.Friends) {
      return this.acceptRequest(relationship);
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
    relationship: Relationship,
  ): Promise<Result<null>> {
    if (
      relationship.type !== RelationshipType.Pending &&
      relationship.type !== RelationshipType.Blocked
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Cannot befriend this user',
        data: null,
      };
    }

    relationship.type = RelationshipType.Friends;
    await this.relationshipRepository.save(relationship);

    const recipientResponse = await this.userProfilesService.getById(
      relationship.recipientId,
    );

    if (recipientResponse.status !== HttpStatus.OK) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unknown error occurred',
        data: null,
      };
    }

    const payload = mapper.map(
      relationship,
      Relationship,
      RelationshipResponseDTO,
    );
    payload.user = recipientResponse.data;

    try {
      this.gatewayMQ.emit(FRIEND_ADDED_EVENT, {
        recipients: [relationship.senderId],
        data: payload,
      } as Payload<RelationshipResponseDTO>);
    } catch (error) {
      console.log(error);
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
        (relationship.senderId != userId && relationship.recipientId != userId)
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
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'An error occurred when deleting relationship',
        data: null,
      };
    }

    try {
      await this.relationshipRepository.delete({ id: relationship.id });
    } catch (error) {
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

    const payload = mapper.map(
      relationship,
      Relationship,
      RelationshipResponseDTO,
    );
    payload.user = senderResponse.data;
    try {
      const p = {
        recipients: [
          relationship.senderId !== userId
            ? relationship.senderId
            : relationship.recipientId,
        ],
        data: payload,
      } as Payload<RelationshipResponseDTO>;
      this.gatewayMQ.emit(FRIEND_REMOVED_EVENT, p);
    } catch (error) {
      console.log(error);
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
      console.log(error);
    }
  }

  emitUserOnline(userId: string) {
    try {
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
        console.log(error);
      }
    } catch (error) {
      console.log(error);
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

  onModuleInit() {
    createMap(mapper, Relationship, RelationshipResponseDTO);
  }
}
