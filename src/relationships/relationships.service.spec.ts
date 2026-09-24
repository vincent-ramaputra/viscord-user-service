import { HttpStatus, Logger } from '@nestjs/common';
import { ClientProxyFactory } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Relationship } from './entities/relationship.entity';
import { RelationshipType } from './enums/relationship-type.enum';
import { RelationshipsService } from './relationships.service';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';
import { UserStatus } from 'src/user-profiles/enums/user-status.enum';
import { UserProfilesService } from 'src/user-profiles/user-profiles.service';
import { OutboxService } from 'src/outbox/outbox.service';
import { DataSource } from 'typeorm';
import { Result } from 'src/interfaces/result.interface';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { Outbox } from 'src/outbox/entities/outbox.entity';
import { OutboxEvent } from 'src/outbox/enums/outbox-event.enum';
import { RelationshipResponseDTO } from './dto/relationship-response.dto';
import { Payload } from 'src/interfaces/payload.dto';

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
  let relationshipRepository: { find: jest.Mock; findOne: jest.Mock };
  let userProfilesService: {
    getUserProfiles: jest.Mock;
    getProfileByUsername: jest.Mock;
    getById: jest.Mock;
  };
  let outboxService: { pushEvent: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { save: jest.Mock };

  beforeEach(async () => {
    // The service builds its RabbitMQ client in the constructor instead of
    // injecting it, so stub the factory to keep this unit test off the network.
    jest.spyOn(ClientProxyFactory, 'create').mockReturnValue({
      emit: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
    } as never);

    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    relationshipRepository = { find: jest.fn(), findOne: jest.fn() };

    userProfilesService = {
      getUserProfiles: jest.fn(),
      getProfileByUsername: jest.fn(),
      getById: jest.fn(),
    };
    outboxService = { pushEvent: jest.fn() };
    manager = {
      save: jest.fn(),
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
        { provide: OutboxService, useValue: outboxService },
        { provide: DataSource, useValue: dataSource },
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
    it('rejects an empty user id without querying', async () => {
      const result = await service.findAll('');

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(relationshipRepository.find).not.toHaveBeenCalled();
    });

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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
      });

      it('returns 500 when transaction failed', async () => {
        outboxService.pushEvent.mockRejectedValue(new Error('outbox down'));

        const result = await service.create(
          ME,
          buildRelationshipRequest('alice'),
        );

        expect(outboxService.pushEvent).toHaveBeenCalled();
        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(result.data).toBeNull();
      });

      it('saves a pending request and push a new message in the same transaction', async () => {
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
        expect(outboxService.pushEvent).toHaveBeenCalledWith(
          {
            event: OutboxEvent.FriendRequestSent,
            data: expect.objectContaining({
              recipients: [ALICE],
              data: expect.objectContaining({
                id: 'rel-new',
                type: RelationshipType.PendingReceived,
                user: expect.objectContaining({
                  id: ME,
                } as UserProfileResponseDTO),
              }),
            } as Payload<RelationshipResponseDTO>),
          } as Pick<Outbox, 'data' | 'event'>,
          manager,
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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
        expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      });

      it('accepts the pending request when the recipient adds the sender back', async () => {
        userProfilesService.getById.mockResolvedValue(
          buildResult<UserProfileResponseDTO>({ data: buildProfile(ME) }),
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
        expect(manager.save).toHaveBeenCalledTimes(1);
        expect(manager.save.mock.calls[0][0]).toBe(existing);
        expect(existing.type).toBe(RelationshipType.Friends);
        expect(outboxService.pushEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            event: OutboxEvent.FriendRequestAccepted,
            data: {
              recipients: [ALICE],
              data: expect.objectContaining({
                user: expect.objectContaining({
                  id: ME,
                }) as UserProfileResponseDTO,
              } as RelationshipResponseDTO),
            } as Payload<RelationshipResponseDTO>,
          } as Pick<Outbox, 'data' | 'event'>),
          manager,
        );
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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
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
        expect(outboxService.pushEvent).not.toHaveBeenCalled();
        expect(manager.save).not.toHaveBeenCalled();
      });
    });
  });
  describe('update', () => {
    it('returns 400 when user id is empty', async () => {
      const result = await service.update('', '', null);

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(relationshipRepository.findOne).not.toHaveBeenCalled();
    });

    it()
  })
});
