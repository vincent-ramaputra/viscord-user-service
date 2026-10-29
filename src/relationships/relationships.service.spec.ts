import { HttpStatus, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Relationship } from './entities/relationship.entity';
import { RelationshipType } from './enums/relationship-type.enum';
import { RelationshipsService } from './relationships.service';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';
import { UserStatus } from 'src/user-profiles/enums/user-status.enum';
import { UserProfilesService } from 'src/user-profiles/user-profiles.service';
import { DataSource } from 'typeorm';
import { Result } from 'src/interfaces/result.interface';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import {
  FRIEND_ADDED_EVENT,
  FRIEND_REMOVED_EVENT,
  FRIEND_REQUEST_SENT_EVENT,
} from 'src/constants/events';
import { RelationshipResponseDTO } from './dto/relationship-response.dto';
import { Payload } from 'src/interfaces/payload.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';

// Distinct ids on purpose: symmetric fixtures (user1/user2) hide an inverted
// sender/recipient ternary, which is the easiest bug to introduce here.
const ME = 'me-id';
const ALICE = 'alice-id';
const BOB = 'bob-id';
const CAROL = 'carol-id';

function buildRelationship(
  overrides: Partial<Relationship> = {},
): Relationship {
  return {
    id: `rel-${Math.random().toString(36).slice(2, 8)}`,
    senderId: ME,
    recipientId: ALICE,
    type: RelationshipType.Friends,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildProfile(id: string): UserProfileResponseDTO {
  return {
    id,
    displayName: `display-${id}`,
    username: `username-${id}`,
    status: UserStatus.Online,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function profilesOk(ids: string[]) {
  return {
    status: HttpStatus.OK,
    message: '',
    data: ids.map(buildProfile),
  };
}

function buildResult<T>(overrides: Partial<Result<T>>): Result<T> {
  return {
    status: HttpStatus.OK,
    data: null,
    message: 'Success',
    ...overrides,
  };
}

function buildRelationshipRequest(username: string): CreateRelationshipDto {
  return { username: username };
}

describe('RelationshipsService', () => {
  let service: RelationshipsService;
  let relationshipRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
  };
  let userProfilesService: {
    getUserProfiles: jest.Mock;
    getProfileByUsername: jest.Mock;
    getById: jest.Mock;
  };
  let gatewayMQ: { emit: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { save: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    // The service builds its RabbitMQ client in the constructor instead of
    // injecting it, so stub the factory to keep this unit test off the network.
    gatewayMQ = { emit: jest.fn() };
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    relationshipRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
    };
    userProfilesService = {
      getUserProfiles: jest.fn(),
      getProfileByUsername: jest.fn(),
      getById: jest.fn(),
    };
    manager = {
      save: jest.fn(),
      delete: jest.fn(),
    };
    dataSource = { transaction: jest.fn(async (cb) => cb(manager)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipsService,
        {
          provide: getRepositoryToken(Relationship),
          useValue: relationshipRepository,
        },
        { provide: UserProfilesService, useValue: userProfilesService },
        { provide: DataSource, useValue: dataSource },
        { provide: 'GATEWAY_MQ', useValue: gatewayMQ },
      ],
    }).compile();

    service = module.get<RelationshipsService>(RelationshipsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it.each(['', undefined])(
      'returns 401 when user id is %p without querying',
      async (userId) => {
        const result = await service.findAll(userId);

        expect(result.status).toBe(HttpStatus.UNAUTHORIZED);
        expect(relationshipRepository.find).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        'a received request',
        { senderId: ALICE, recipientId: ME, type: RelationshipType.Pending },
        RelationshipType.PendingReceived,
      ],
      [
        'a sent request',
        { senderId: ME, recipientId: ALICE, type: RelationshipType.Pending },
        RelationshipType.Pending,
      ],
      [
        'an accepted friendship',
        { senderId: ALICE, recipientId: ME, type: RelationshipType.Friends },
        RelationshipType.Friends,
      ],
    ])(
      'reports %s with the type seen by the caller',
      async (_name, row, expected) => {
        relationshipRepository.find.mockResolvedValue([buildRelationship(row)]);
        userProfilesService.getUserProfiles.mockResolvedValue(
          profilesOk([ALICE]),
        );

        const result = await service.findAll(ME);

        expect(result.status).toBe(HttpStatus.OK);
        expect(result.data[0].type).toBe(expected);
      },
    );

    it('attaches the other user profile, never the caller own', async () => {
      relationshipRepository.find.mockResolvedValue([
        buildRelationship({ id: 'rel-1', senderId: ME, recipientId: ALICE }),
        buildRelationship({ id: 'rel-2', senderId: BOB, recipientId: ME }),
      ]);
      userProfilesService.getUserProfiles.mockResolvedValue(
        profilesOk([ALICE, BOB]),
      );

      const result = await service.findAll(ME);

      const byId = new Map(result.data.map((dto) => [dto.id, dto]));
      expect(byId.get('rel-1').user.id).toBe(ALICE);
      expect(byId.get('rel-2').user.id).toBe(BOB);
      expect(result.data.map((dto) => dto.user.id)).not.toContain(ME);
    });

    it('fetches every profile in a single batched call', async () => {
      relationshipRepository.find.mockResolvedValue([
        buildRelationship({ senderId: ME, recipientId: ALICE }),
        buildRelationship({ senderId: BOB, recipientId: ME }),
        buildRelationship({ senderId: ME, recipientId: CAROL }),
      ]);
      userProfilesService.getUserProfiles.mockResolvedValue(
        profilesOk([ALICE, BOB, CAROL]),
      );

      await service.findAll(ME);

      // Guards the N+1 fix: one round trip regardless of relationship count.
      expect(userProfilesService.getUserProfiles).toHaveBeenCalledTimes(1);
      const requestedIds = userProfilesService.getUserProfiles.mock.calls[0][0];
      expect(requestedIds).toEqual(expect.arrayContaining([ALICE, BOB, CAROL]));
      expect(requestedIds).toHaveLength(3);
    });

    it('hides a block made against the caller, and does not look it up', async () => {
      relationshipRepository.find.mockResolvedValue([
        buildRelationship({
          id: 'rel-visible',
          senderId: ME,
          recipientId: ALICE,
        }),
        buildRelationship({
          id: 'rel-hidden',
          senderId: BOB,
          recipientId: ME,
          type: RelationshipType.Blocked,
        }),
      ]);
      userProfilesService.getUserProfiles.mockResolvedValue(
        profilesOk([ALICE]),
      );

      const result = await service.findAll(ME);

      expect(result.data.map((dto) => dto.id)).toEqual(['rel-visible']);
      // A blocker's id must not leak into the profile lookup either.
      expect(
        userProfilesService.getUserProfiles.mock.calls[0][0],
      ).not.toContain(BOB);
    });

    it('keeps a block the caller made', async () => {
      relationshipRepository.find.mockResolvedValue([
        buildRelationship({
          senderId: ME,
          recipientId: ALICE,
          type: RelationshipType.Blocked,
        }),
      ]);
      userProfilesService.getUserProfiles.mockResolvedValue(
        profilesOk([ALICE]),
      );

      const result = await service.findAll(ME);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe(RelationshipType.Blocked);
    });

    it('returns an error Result when the profile lookup fails', async () => {
      relationshipRepository.find.mockResolvedValue([
        buildRelationship({ senderId: ME, recipientId: ALICE }),
      ]);
      // The shape getUserProfiles returns when Postgres is unreachable.
      userProfilesService.getUserProfiles.mockResolvedValue({
        status: HttpStatus.BAD_REQUEST,
        message: 'User not found',
        data: null,
      });

      // Must not throw: this service reports failure through Result.
      const result = await service.findAll(ME);

      expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.data).toBeNull();
    });

    it('returns a null user when a profile is missing', async () => {
      relationshipRepository.find.mockResolvedValue([
        buildRelationship({ senderId: ME, recipientId: ALICE }),
      ]);
      userProfilesService.getUserProfiles.mockResolvedValue(profilesOk([]));

      const result = await service.findAll(ME);

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.data[0].user).toBeNull();
    });

    it('returns an empty list when the user has no relationships', async () => {
      relationshipRepository.find.mockResolvedValue([]);
      userProfilesService.getUserProfiles.mockResolvedValue(profilesOk([]));

      const result = await service.findAll(ME);

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.data).toEqual([]);
    });
  });

  describe('create', () => {
    it('returns 400 when adding invalid username', async () => {
      userProfilesService.getProfileByUsername.mockResolvedValue(
        buildResult<UserProfileResponseDTO>({
          status: HttpStatus.NOT_FOUND,
          message: 'Username not found',
        }),
      );

      const dto: CreateRelationshipDto = buildRelationshipRequest('bob');
      const result = await service.create(ME, dto);

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('returns 400 when the user adds themselves', async () => {
      userProfilesService.getProfileByUsername.mockResolvedValue(
        buildResult<UserProfileResponseDTO>({ data: buildProfile(ME) }),
      );

      const dto: CreateRelationshipDto = buildRelationshipRequest('me');
      const result = await service.create(ME, dto);

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(manager.save).not.toHaveBeenCalled();
    });

    describe('when relationship does not exist', () => {
      beforeEach(() => {
        manager.save.mockImplementation(async (entity) => {
          entity.id = 'rel-new';
          return entity;
        });
        userProfilesService.getProfileByUsername.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({
            status: HttpStatus.OK,
            data: buildProfile(ALICE),
          }),
        );
        relationshipRepository.findOne.mockResolvedValue(null);
        userProfilesService.getById.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({ data: buildProfile(ME) }),
        );
      });

      it('returns 500 when the service cannot retrieve sender data', async () => {
        userProfilesService.getById.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'User data not found',
          }),
        );

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(userProfilesService.getById).toHaveBeenCalledWith(ME);
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
      });

      it('returns 500 and not push event when save failed', async () => {
        manager.save.mockRejectedValue(new Error('database down'));

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(manager.save).toHaveBeenCalled();
        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.data).toBeNull();
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
      });

      it('still returns 200 when emitting the event throws', async () => {
        gatewayMQ.emit.mockImplementation(() => {
          throw new Error('rabbitmq down');
        });

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(manager.save).toHaveBeenCalled();
        expect(gatewayMQ.emit).toHaveBeenCalled();
        expect(result.status).toBe(HttpStatus.OK);
      });

      it('saves a pending request and emits a friend request event', async () => {
        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(manager.save).toHaveBeenCalledWith(
          expect.objectContaining({
            senderId: ME,
            recipientId: ALICE,
            type: RelationshipType.Pending,
          } as Relationship),
        );
        expect(gatewayMQ.emit).toHaveBeenCalledWith(
          FRIEND_REQUEST_SENT_EVENT,
          expect.objectContaining({
            recipients: [ALICE],
            data: expect.objectContaining({
              id: 'rel-new',
              type: RelationshipType.PendingReceived,
              user: expect.objectContaining({
                id: ME,
              } as UserProfileResponseDTO),
            }),
          } as Payload<RelationshipResponseDTO>),
        );

        expect(result.status).toBe(HttpStatus.OK);
        expect(result.data.type).toBe(RelationshipType.Pending);
        expect(result.data.user.id).toBe(ALICE);
      });
    });

    describe('when relationship exist', () => {
      beforeEach(() => {
        manager.save.mockImplementation((entity) => entity);
        userProfilesService.getProfileByUsername.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({ data: buildProfile(ALICE) }),
        );
      });

      it('returns 400 when relationship is already friends', async () => {
        relationshipRepository.findOne.mockResolvedValue(
          buildRelationship({
            recipientId: ALICE,
            senderId: ME,
            type: RelationshipType.Friends,
          }),
        );

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(manager.save).not.toHaveBeenCalled();
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
      });

      it('returns 200 and does nothing when existing relationship sender is the user', async () => {
        relationshipRepository.findOne.mockResolvedValue(
          buildRelationship({
            recipientId: ALICE,
            senderId: ME,
            type: RelationshipType.Pending,
          }),
        );

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(result.status).toBe(HttpStatus.OK);
        expect(manager.save).not.toHaveBeenCalled();
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
      });

      it("returns 500 when the accepter's profile can't be loaded", async () => {
        userProfilesService.getById.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({
            status: HttpStatus.INTERNAL_SERVER_ERROR,
          }),
        );
        const existing = buildRelationship({
          recipientId: ME,
          senderId: ALICE,
          type: RelationshipType.Pending,
        });
        relationshipRepository.findOne.mockResolvedValue(existing);

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(userProfilesService.getById).toHaveBeenCalledWith(ME);
        expect(manager.save).not.toHaveBeenCalled();
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      });

      it('accepts the pending request when the recipient adds the sender back', async () => {
        userProfilesService.getById.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({ data: buildProfile(ME) }),
        );
        const existing = buildRelationship({
          id: 'rel-123',
          recipientId: ME,
          senderId: ALICE,
          type: RelationshipType.Pending,
        });
        relationshipRepository.findOne.mockResolvedValue(existing);
        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(userProfilesService.getById).toHaveBeenCalledWith(ME);
        expect(manager.save).toHaveBeenCalledTimes(1);
        expect(manager.save.mock.calls[0][0]).toBe(existing);
        expect(existing.type).toBe(RelationshipType.Friends);
        expect(gatewayMQ.emit).toHaveBeenCalledWith(FRIEND_ADDED_EVENT, {
          recipients: [ALICE],
          data: expect.objectContaining({
            id: 'rel-123',
            user: expect.objectContaining({
              id: ME,
            }) as UserProfileResponseDTO,
          } as RelationshipResponseDTO),
        } as Payload<RelationshipResponseDTO>);
        expect(result.status).toBe(HttpStatus.OK);
      });

      it('returns 409 when the user tries to add a user they have blocked', async () => {
        const existing = buildRelationship({
          recipientId: ALICE,
          senderId: ME,
          type: RelationshipType.Blocked,
        });
        relationshipRepository.findOne.mockResolvedValue(existing);

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(result.status).toBe(HttpStatus.CONFLICT);
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('returns 400 when the user tries to add a user that blocked them', async () => {
        const existing = buildRelationship({
          recipientId: ME,
          senderId: ALICE,
          type: RelationshipType.Blocked,
        });
        relationshipRepository.findOne.mockResolvedValue(existing);

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(result).toEqual({
          status: HttpStatus.BAD_REQUEST,
          message:
            "Hm, didn't work. Double check that the username is correct.",
          data: null,
        });
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
        expect(manager.save).not.toHaveBeenCalled();
      });
    });
  });
  describe('update', () => {
    it('returns 400 when relationship is not found', async () => {
      relationshipRepository.findOneBy.mockResolvedValue(null);

      const result = await service.update(ME, 'rel-123', {
        type: RelationshipType.Friends,
      } as UpdateRelationshipDto);

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
        id: 'rel-123',
      });
    });

    it('returns 403 when user is not neither sender or recipient', async () => {
      const existing = buildRelationship({ senderId: BOB, recipientId: ALICE });
      relationshipRepository.findOneBy.mockResolvedValue(existing);

      const result = await service.update(ME, existing.id, {
        type: RelationshipType.Friends,
      } as UpdateRelationshipDto);

      expect(result.status).toBe(HttpStatus.FORBIDDEN);
      expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
        id: existing.id,
      });
    });

    it.each([
      { name: 'None', type: RelationshipType.None },
      { name: 'Pending', type: RelationshipType.Pending },
      { name: 'PendingReceived', type: RelationshipType.PendingReceived },
    ])(
      'returns 400 when the updated relationship type is $name',
      async ({ type }) => {
        const existing = buildRelationship({
          senderId: ME,
          recipientId: ALICE,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);

        const result = await service.update(ME, existing.id, {
          type: type,
        } as UpdateRelationshipDto);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
          id: existing.id,
        });
      },
    );

    describe('when accepting friend request', () => {
      beforeEach(() => {
        manager.save.mockImplementation((entity) => entity);
      });

      it.each([
        { name: 'Friends', type: RelationshipType.Friends },
        { name: 'Blocked', type: RelationshipType.Blocked },
      ])(
        'returns 400 when accepting a request for $name relationship',
        async ({ type }) => {
          const existing = buildRelationship({
            senderId: ALICE,
            recipientId: ME,
            type: type,
          });
          relationshipRepository.findOneBy.mockResolvedValue(existing);

          const result = await service.update(ME, existing.id, {
            type: RelationshipType.Friends,
          } as UpdateRelationshipDto);

          expect(result.status).toBe(HttpStatus.BAD_REQUEST);
          expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
            id: existing.id,
          });
          expect(manager.save).not.toHaveBeenCalled();
        },
      );

      it('returns 403 when accepting a request but the user is not the recipient', async () => {
        const existing = buildRelationship({
          senderId: ME,
          recipientId: ALICE,
          type: RelationshipType.Pending,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);

        const result = await service.update(ME, existing.id, {
          type: RelationshipType.Friends,
        } as UpdateRelationshipDto);

        expect(result.status).toBe(HttpStatus.FORBIDDEN);
        expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
          id: existing.id,
        });
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('returns 500 when unable to retrieve user profile', async () => {
        const existing = buildRelationship({
          senderId: ALICE,
          recipientId: ME,
          type: RelationshipType.Pending,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);
        userProfilesService.getById.mockResolvedValue(
          buildResult({
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'User service down',
          }),
        );

        const result = await service.update(ME, existing.id, {
          type: RelationshipType.Friends,
        } as UpdateRelationshipDto);

        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
          id: existing.id,
        });
        expect(manager.save).not.toHaveBeenCalled();
        expect(userProfilesService.getById).toHaveBeenCalledWith(ME);
      });

      it('returns 500 when transaction failed', async () => {
        const existing = buildRelationship({
          senderId: ALICE,
          recipientId: ME,
          type: RelationshipType.Pending,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);
        userProfilesService.getById.mockResolvedValue(
          buildResult({ data: buildProfile(ME) }),
        );
        manager.save.mockRejectedValue(new Error('Database down'));

        const result = await service.update(ME, existing.id, {
          type: RelationshipType.Friends,
        } as UpdateRelationshipDto);

        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
      });

      it('updates relationship and emits a friend added event', async () => {
        const existing = buildRelationship({
          id: 'rel-123',
          senderId: ALICE,
          recipientId: ME,
          type: RelationshipType.Pending,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);
        userProfilesService.getById.mockResolvedValue(
          buildResult({ data: buildProfile(ME) }),
        );

        const result = await service.update(ME, existing.id, {
          type: RelationshipType.Friends,
        } as UpdateRelationshipDto);

        expect(result.status).toBe(HttpStatus.NO_CONTENT);
        expect(manager.save).toHaveBeenCalledWith(
          expect.objectContaining({
            id: existing.id,
            type: RelationshipType.Friends,
          }),
        );
        expect(gatewayMQ.emit).toHaveBeenCalledWith(FRIEND_ADDED_EVENT, {
          recipients: [ALICE],
          data: expect.objectContaining({
            id: 'rel-123',
            user: expect.objectContaining({
              id: ME,
            } as UserProfileResponseDTO),
          }),
        } as Payload<RelationshipResponseDTO>);
      });
    });
  });

  describe('remove', () => {
    it('returns 400 when relationship is not found', async () => {
      const existing = buildRelationship({
        id: 'rel-123',
        senderId: ME,
        recipientId: ALICE,
        type: RelationshipType.Friends,
      });
      relationshipRepository.findOneBy.mockResolvedValue(null);

      const result = await service.remove(ME, existing.id);

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
        id: 'rel-123',
      });
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('returns 403 when removing relationship that the user is not in', async () => {
      const existing = buildRelationship({
        id: 'rel-123',
        senderId: BOB,
        recipientId: ALICE,
        type: RelationshipType.Friends,
      });
      relationshipRepository.findOneBy.mockResolvedValue(existing);

      const result = await service.remove(ME, existing.id);

      expect(result.status).toBe(HttpStatus.FORBIDDEN);
      expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
        id: 'rel-123',
      });
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('returns 403 when removing relationship where the user is blocked', async () => {
      const existing = buildRelationship({
        id: 'rel-123',
        senderId: BOB,
        recipientId: ME,
        type: RelationshipType.Blocked,
      });
      relationshipRepository.findOneBy.mockResolvedValue(existing);

      const result = await service.remove(ME, existing.id);

      expect(result.status).toBe(HttpStatus.FORBIDDEN);
      expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
        id: 'rel-123',
      });
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('returns 500 when repository throws error', async () => {
      relationshipRepository.findOneBy.mockRejectedValue(
        new Error('Repository error'),
      );

      const result = await service.remove(ME, 'rel-123');

      expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(relationshipRepository.findOneBy).toHaveBeenCalledWith({
        id: 'rel-123',
      });
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('returns 500 when failed retrieving user profile', async () => {
      const existing = buildRelationship({
        id: 'rel-123',
        senderId: ME,
        recipientId: BOB,
        type: RelationshipType.Friends,
      });
      relationshipRepository.findOneBy.mockResolvedValue(existing);
      userProfilesService.getById.mockResolvedValue(
        buildResult({
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'User profile service down',
        }),
      );

      const result = await service.remove(ME, existing.id);

      expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(userProfilesService.getById).toHaveBeenCalledWith(ME);
      expect(manager.delete).not.toHaveBeenCalled();
    });

    describe('when deleting', () => {
      it('returns 500 and not push event when delete failed', async () => {
        const existing = buildRelationship({
          id: 'rel-123',
          senderId: ME,
          recipientId: BOB,
          type: RelationshipType.Friends,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);
        userProfilesService.getById.mockResolvedValue(
          buildResult({ data: buildProfile(ME) }),
        );
        manager.delete.mockRejectedValue(new Error('Database down'));

        const result = await service.remove(ME, existing.id);

        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(manager.delete).toHaveBeenCalled();
        expect(gatewayMQ.emit).not.toHaveBeenCalled();
      });

      it('still returns 204 when emitting the event throws', async () => {
        const existing = buildRelationship({
          id: 'rel-123',
          senderId: ME,
          recipientId: BOB,
          type: RelationshipType.Friends,
        });
        relationshipRepository.findOneBy.mockResolvedValue(existing);
        userProfilesService.getById.mockResolvedValue(
          buildResult({ data: buildProfile(ME) }),
        );
        gatewayMQ.emit.mockImplementation(() => {
          throw new Error('rabbitmq down');
        });

        const result = await service.remove(ME, existing.id);

        expect(result.status).toBe(HttpStatus.NO_CONTENT);
        expect(manager.delete).toHaveBeenCalled();
        expect(gatewayMQ.emit).toHaveBeenCalled();
      });

      it.each([
        {
          action: 'unfriend as sender',
          row: {
            senderId: ME,
            recipientId: BOB,
            type: RelationshipType.Friends,
          },
          notified: BOB,
        },
        {
          action: 'unfriend as recipient',
          row: {
            senderId: ALICE,
            recipientId: ME,
            type: RelationshipType.Friends,
          },
          notified: ALICE,
        },
        {
          action: 'cancel friend request',
          row: {
            senderId: ME,
            recipientId: ALICE,
            type: RelationshipType.Pending,
          },
          notified: ALICE,
        },
        {
          action: 'reject friend request',
          row: {
            senderId: BOB,
            recipientId: ME,
            type: RelationshipType.Pending,
          },
          notified: BOB,
        },
      ])(
        'delete relationship and notify other user on $action',
        async ({ row, notified }) => {
          const existing = buildRelationship({ id: 'rel-123', ...row });
          relationshipRepository.findOneBy.mockResolvedValue(existing);
          userProfilesService.getById.mockResolvedValue(
            buildResult({ data: buildProfile(ME) }),
          );

          const result = await service.remove(ME, existing.id);

          expect(result.status).toBe(HttpStatus.NO_CONTENT);
          expect(userProfilesService.getById).toHaveBeenCalledWith(ME);
          expect(manager.delete).toHaveBeenCalledWith(
            Relationship,
            expect.objectContaining({ id: 'rel-123' }),
          );
          expect(gatewayMQ.emit).toHaveBeenCalledWith(FRIEND_REMOVED_EVENT, {
            recipients: [notified],
            data: expect.objectContaining({
              id: 'rel-123',
              user: expect.objectContaining({
                id: ME,
              } as UserProfileResponseDTO),
            } as RelationshipResponseDTO),
          } as Payload<RelationshipResponseDTO>);
        },
      );
    });
  });
});
