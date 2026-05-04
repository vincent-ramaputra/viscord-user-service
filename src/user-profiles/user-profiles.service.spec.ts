import { Test, TestingModule } from '@nestjs/testing';
import { UserProfilesService } from './user-profiles.service';
import { UserProfile } from './entities/user-profile.entity';
import { QueryFailedError, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StorageService } from 'src/storage/storage.service';
import { RelationshipsService } from 'src/relationships/relationships.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { HttpStatus } from '@nestjs/common';

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
    Pick<Repository<UserProfile>, 'findOneBy' | 'save'>
  >;
  let storageService: jest.Mocked<
    Pick<StorageService, 'getFiles' | 'toPublicURL'>
  >;

  beforeAll(async () => {
    userProfilesRepository = {
      findOneBy: jest.fn(),
      save: jest.fn(),
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
    service.onModuleInit();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('create', () => {
    describe('Data validation', () => {
      it('Should return 400 when id is empty string', async () => {
        const dto = makeDto({ id: '' });

        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(result.message).toBe('User id is empty');
        expect(userProfilesRepository.save).not.toHaveBeenCalled();
      });

      it('Should return 400 when id is null', async () => {
        const dto = makeDto({ id: null });

        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(result.message).toBe('User id is empty');
        expect(userProfilesRepository.save).not.toHaveBeenCalled();
      });

      it('Should return 400 when display name is empty string', async () => {
        const dto = makeDto({ displayName: '' });

        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(result.message).toBe('Display name must be filled');
        expect(userProfilesRepository.save).not.toHaveBeenCalled();
      });

      it('Should return 400 when display name is null', async () => {
        const dto = makeDto({ displayName: null });
        const result = await service.create(dto);

        expect(result.status).toBe(HttpStatus.BAD_REQUEST);
        expect(result.message).toBe('Display name must be filled');
        expect(userProfilesRepository.save).not.toHaveBeenCalled();
      });
    });

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
});
