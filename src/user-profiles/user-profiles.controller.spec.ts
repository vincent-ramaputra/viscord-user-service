import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { AuthGuard } from 'src/common/guards/auth/auth.guard';
import { createValidationPipe } from 'src/common/pipes/validation.pipe';
import { UserProfilesController } from './user-profiles.controller';
import { UserProfilesService } from './user-profiles.service';
import { UserStatus } from './enums/user-status.enum';
import { USERNAME_MESSAGE } from './domain/username';

const ME = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c34';
const NEW_USER = '7d1e4a2b-5c6f-4b8a-9e0d-2c3b4a5f6e7d';

describe('UserProfilesController', () => {
  let app: INestApplication;
  const userProfilesService = {
    create: jest.fn(),
    updateUsername: jest.fn(),
    updateStatus: jest.fn(),
    updateUserProfile: jest.fn(),
    getById: jest.fn(),
  };
  const ok = { status: HttpStatus.OK, message: 'ok', data: null };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserProfilesController],
      providers: [
        { provide: UserProfilesService, useValue: userProfilesService },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => await app.close());
  afterEach(() => jest.resetAllMocks());

  describe('POST /user-profiles', () => {
    const valid = { id: NEW_USER, username: 'newuser', displayName: 'New' };

    it('is public so auth-service can create a profile during registration', async () => {
      userProfilesService.create.mockResolvedValueOnce({
        status: HttpStatus.CREATED,
        data: valid,
        message: 'User profile created',
      });

      await request(app.getHttpServer())
        .post('/user-profiles')
        .send(valid)
        .expect(HttpStatus.CREATED);

      expect(userProfilesService.create).toHaveBeenCalledWith(
        expect.objectContaining(valid),
      );
    });

    it.each([
      ['Vincent', 'vincent'],
      ['MiXeD_Case.1', 'mixed_case.1'],
      ['vincent_r', 'vincent_r'],
      ['vin.cent', 'vin.cent'],
    ])(
      'accepts username %p and passes it to the service as %p',
      async (username, expected) => {
        userProfilesService.create.mockResolvedValueOnce({
          status: HttpStatus.CREATED,
          data: null,
          message: 'User profile created',
        });

        await request(app.getHttpServer())
          .post('/user-profiles')
          .send({ ...valid, username })
          .expect(HttpStatus.CREATED);

        expect(userProfilesService.create).toHaveBeenCalledWith(
          expect.objectContaining({ username: expected }),
        );
      },
    );

    it.each([
      ['id is not a UUID', { ...valid, id: 'new-user' }],
      ['id is missing', { ...valid, id: undefined }],
      ['username has special characters', { ...valid, username: 'new_user!' }],
      ['username has a space', { ...valid, username: 'new user' }],
      ['username is missing', { ...valid, username: undefined }],
      // The username transform must leave non-strings alone so IsString can reject them (not crash → 500)
      ['username is a number', { ...valid, username: 123 }],
      ['username is an array', { ...valid, username: ['newuser'] }],
      ['displayName is empty', { ...valid, displayName: '' }],
      ['displayName is missing', { ...valid, displayName: undefined }],
    ])('returns 400 when %s', async (_, body) => {
      await request(app.getHttpServer())
        .post('/user-profiles')
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(userProfilesService.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /user-profiles/username', () => {
    // auth-service shows this message as the registration form's username error,
    // so validation errors must stay in the Result envelope with a single string message.
    it('returns validation errors in the Result envelope with a single message', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user-profiles/username')
        .set('X-User-Id', ME)
        .send({ username: 'vin$ent' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body).toEqual({
        status: HttpStatus.BAD_REQUEST,
        message: USERNAME_MESSAGE,
        data: null,
      });
    });

    it('passes a valid username to the service', async () => {
      userProfilesService.updateUsername.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .patch('/user-profiles/username')
        .set('X-User-Id', ME)
        .send({ username: 'vincent' })
        .expect(HttpStatus.OK);

      expect(userProfilesService.updateUsername).toHaveBeenCalledWith(
        ME,
        expect.objectContaining({ username: 'vincent' }),
      );
    });

    it.each([
      ['Vincent', 'vincent'],
      ['MiXeD_Case.1', 'mixed_case.1'],
      ['vincent_r', 'vincent_r'],
      ['vin.cent', 'vin.cent'],
    ])(
      'accepts username %p and passes it to the service as %p',
      async (username, expected) => {
        userProfilesService.updateUsername.mockResolvedValueOnce(ok);

        await request(app.getHttpServer())
          .patch('/user-profiles/username')
          .set('X-User-Id', ME)
          .send({ username })
          .expect(HttpStatus.OK);

        expect(userProfilesService.updateUsername).toHaveBeenCalledWith(
          ME,
          expect.objectContaining({ username: expected }),
        );
      },
    );

    it.each([
      ['has special characters', { username: 'vin$ent' }],
      ['has a space', { username: 'vin cent' }],
      ['is empty', { username: '' }],
      ['is missing', {}],
      ['is a number', { username: 123 }],
      ['is an array', { username: ['vincent'] }],
    ])('returns 400 when the username %s', async (_, body) => {
      await request(app.getHttpServer())
        .patch('/user-profiles/username')
        .set('X-User-Id', ME)
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(userProfilesService.updateUsername).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /user-profiles/status', () => {
    it('passes a valid status to the service with the caller id', async () => {
      userProfilesService.updateStatus.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .patch('/user-profiles/status')
        .set('X-User-Id', ME)
        .send({ status: UserStatus.Idle })
        .expect(HttpStatus.OK);

      expect(userProfilesService.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ME, status: UserStatus.Idle }),
      );
    });

    // UserStatus is a numeric enum, and @IsEnum also accepts its member names ('Online').
    it.each([
      ['is not a UserStatus value', { status: 99 }],
      ['is the enum name instead of its value', { status: 'Online' }],
      ['is missing', {}],
    ])('returns 400 when status %s', async (_, body) => {
      await request(app.getHttpServer())
        .patch('/user-profiles/status')
        .set('X-User-Id', ME)
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(userProfilesService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /user-profiles', () => {
    it('returns 401 without calling the service when X-User-Id is missing', async () => {
      await request(app.getHttpServer())
        .patch('/user-profiles')
        .send({ displayName: 'New' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(userProfilesService.updateUserProfile).not.toHaveBeenCalled();
    });

    it('accepts an empty body because every field is optional', async () => {
      userProfilesService.updateUserProfile.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .patch('/user-profiles')
        .set('X-User-Id', ME)
        .send({})
        .expect(HttpStatus.OK);

      expect(userProfilesService.updateUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({ id: ME }),
      );
    });

    it.each([
      ['displayName', { displayName: 123 }],
      ['pronouns', { pronouns: 123 }],
      ['bio', { bio: 123 }],
    ])('returns 400 when %s is not a string', async (_, body) => {
      await request(app.getHttpServer())
        .patch('/user-profiles')
        .set('X-User-Id', ME)
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(userProfilesService.updateUserProfile).not.toHaveBeenCalled();
    });
  });

  describe('GET /user-profiles/:id', () => {
    it('passes a valid id to the service', async () => {
      userProfilesService.getById.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .get(`/user-profiles/${NEW_USER}`)
        .set('X-User-Id', ME)
        .expect(HttpStatus.OK);

      expect(userProfilesService.getById).toHaveBeenCalledWith(NEW_USER);
    });

    it('returns 400 without calling the service when the id is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/user-profiles/not-a-uuid')
        .set('X-User-Id', ME)
        .expect(HttpStatus.BAD_REQUEST);

      expect(userProfilesService.getById).not.toHaveBeenCalled();
    });
  });
});
