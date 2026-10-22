import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { AuthGuard } from 'src/common/guards/auth/auth.guard';
import { UserProfilesController } from './user-profiles.controller';
import { UserProfilesService } from './user-profiles.service';

describe('UserProfilesController', () => {
  let app: INestApplication;
  const userProfilesService: {
    create: jest.Mock;
    updateUserProfile: jest.Mock;
  } = {
    create: jest.fn(),
    updateUserProfile: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserProfilesController],
      providers: [
        { provide: UserProfilesService, useValue: userProfilesService },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => await app.close());
  afterEach(() => jest.resetAllMocks());

  it('POST /user-profiles is public so auth-service can create a profile during registration', async () => {
    const dto = { id: 'new-user', username: 'new', displayName: 'New' };
    userProfilesService.create.mockResolvedValueOnce({
      status: HttpStatus.CREATED,
      data: dto,
      message: 'User profile created',
    });

    await request(app.getHttpServer())
      .post('/user-profiles')
      .send(dto)
      .expect(HttpStatus.CREATED);

    expect(userProfilesService.create).toHaveBeenCalledWith(
      expect.objectContaining(dto),
    );
  });

  it('PATCH /user-profiles returns 401 without calling the service when X-User-Id is missing', async () => {
    await request(app.getHttpServer())
      .patch('/user-profiles')
      .send({ displayName: 'New' })
      .expect(HttpStatus.UNAUTHORIZED);

    expect(userProfilesService.updateUserProfile).not.toHaveBeenCalled();
  });
});
