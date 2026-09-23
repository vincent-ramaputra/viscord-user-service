import { HttpStatus } from '@nestjs/common';
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

describe('RelationshipsService', () => {
  let service: RelationshipsService;
  let relationshipRepository: { find: jest.Mock };
  let userProfilesService: { getUserProfiles: jest.Mock };
  let outboxService: { pushEvent: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    // The service builds its RabbitMQ client in the constructor instead of
    // injecting it, so stub the factory to keep this unit test off the network.
    jest.spyOn(ClientProxyFactory, 'create').mockReturnValue({
      emit: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
    } as never);

    relationshipRepository = { find: jest.fn() };

    userProfilesService = { getUserProfiles: jest.fn() };
    outboxService = { pushEvent: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipsService,
        {
          provide: getRepositoryToken(Relationship),
          useValue: relationshipRepository,
        },
        { provide: UserProfilesService, useValue: userProfilesService },
        { provide: OutboxService, useValue: outboxService },
        { provide: DataSource, useValue: dataSource }
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
});
