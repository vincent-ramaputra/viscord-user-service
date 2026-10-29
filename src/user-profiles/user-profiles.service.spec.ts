import { Test, TestingModule } from '@nestjs/testing';
import { UserProfilesService } from './user-profiles.service';
import { UserProfile } from './entities/user-profile.entity';
import { QueryFailedError, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StorageService } from 'src/storage/storage.service';
import { RelationshipsService } from 'src/relationships/relationships.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { HttpStatus } from '@nestjs/common';
import { UpdateUsernameDTO } from './dto/update-username.dto';
import { USERNAME_TAKEN_MESSAGE } from './domain/username';

const MOCK_AVATAR_URLS = [
  'https://cdn.com/avatars/avatar-1.png',
  'https://cdn.com/avatars/avatar-2.png',
  'https://cdn.com/avatars/avatar-3.png',
];
function makeDto(
  overrides: Partial<CreateUserProfileDto> = {},
): CreateUserProfileDto {
  const dto = new CreateUserProfileDto();
  dto.id = 'uuid-001';
  dto.username = 'testuser';
  dto.displayName = 'Test User';

  Object.assign(dto, overrides);

  return dto;
}

describe('UserProfilesService', () => {
  let service: UserProfilesService;
  let userProfilesRepository: jest.Mocked<
    Pick<Repository<UserProfile>, 'findOneBy' | 'findOne' | 'save' | 'update'>
  >;
  let storageService: jest.Mocked<
    Pick<StorageService, 'getFiles' | 'toPublicURL'>
  >;

  beforeAll(async () => {
    userProfilesRepository = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    storageService = {
      getFiles: jest.fn(),
      toPublicURL: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfilesService,
        {
          provide: getRepositoryToken(UserProfile),
          useValue: userProfilesRepository,
        },
        { provide: StorageService, useValue: storageService },
        {
          provide: RelationshipsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<UserProfilesService>(UserProfilesService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('create', () => {
    describe('Username uniqueness', () => {
      it('Should return 400 when username is taken', async () => {
        const dto = makeDto();
        storageService.getFiles.mockResolvedValue(MOCK_AVATAR_URLS);
        const error = new QueryFailedError('', [], new Error());
        (error as any).code = '23505';
        userProfilesRepository.save.mockRejectedValue(error);

        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(result.message).toBe('This username is already used');
        expect(result.data).toBeNull();
      });

      it('Should query different-cased username with lowercase', async () => {
        const dto = makeDto({ username: 'TestUser' });
        storageService.getFiles.mockResolvedValue(MOCK_AVATAR_URLS);

        await service.create(dto);

        expect(userProfilesRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ username: dto.username.toLowerCase() }),
        );
      });
    });

    describe('Successful creation', () => {
      it('Should return 201 with created profile data', async () => {
        const dto = makeDto();
        storageService.getFiles.mockResolvedValue(MOCK_AVATAR_URLS);

        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.CREATED);
        expect(result.message).toBe('User profile created successfully');
        expect(result.data.id).toBe(dto.id);
        expect(result.data.username).toBe(dto.username);
        expect(userProfilesRepository.save).toHaveBeenCalledTimes(1);
      });
      it('Should return 201 with lowercased username', async () => {
        const dto = makeDto({ username: 'TestUSER' });
        storageService.getFiles.mockResolvedValue(MOCK_AVATAR_URLS);

        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.CREATED);
        expect(result.data.username).toBe(dto.username.toLowerCase());
      });
    });
  });

  describe('updateUsername', () => {
    const makeUsernameDto = (username: string) => {
      const dto = new UpdateUsernameDTO();
      dto.username = username;
      return dto;
    };

    it('Should save the username for the given user and return 200', async () => {
      const result = await service.updateUsername(
        'uuid-001',
        makeUsernameDto('newname'),
      );

      expect(userProfilesRepository.update).toHaveBeenCalledWith('uuid-001', {
        username: 'newname',
      });
      expect(result.status).toBe(HttpStatus.OK);
    });

    it('Should return 400 when the username is taken', async () => {
      const error = new QueryFailedError('', [], new Error());
      (error as any).code = '23505';
      userProfilesRepository.update.mockRejectedValue(error);

      const result = await service.updateUsername(
        'uuid-001',
        makeUsernameDto('taken'),
      );

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(result.message).toBe(USERNAME_TAKEN_MESSAGE);
      expect(result.data).toBeNull();
    });

    // Same convention as create: only the unique violation is handled, anything else is rethrown.
    it('Should rethrow other database errors instead of reporting success', async () => {
      const error = new Error('connection terminated');
      userProfilesRepository.update.mockRejectedValue(error);

      await expect(
        service.updateUsername('uuid-001', makeUsernameDto('newname')),
      ).rejects.toThrow(error);
    });
  });

  describe('getProfileByUsername', () => {
    it('Should query by the lowercased username', async () => {
      const profile = new UserProfile();
      profile.id = 'uuid-001';
      profile.username = 'vincent';
      profile.defaultAvatarURL = 'avatar-1.png';
      userProfilesRepository.findOne.mockResolvedValue(profile);

      const result = await service.getProfileByUsername('Vincent');

      expect(userProfilesRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'vincent' },
      });
      expect(result.status).toBe(HttpStatus.OK);
      expect(result.data.username).toBe('vincent');
    });

    it('Should return 400 when no profile has that username', async () => {
      userProfilesRepository.findOne.mockResolvedValue(null);

      const result = await service.getProfileByUsername('nobody');

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(result.message).toBe('User not found');
    });

    it.each(['', undefined])(
      'Should return 400 without querying when the username is %p',
      async (username) => {
        const result = await service.getProfileByUsername(username);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(userProfilesRepository.findOne).not.toHaveBeenCalled();
      },
    );
  });
});
