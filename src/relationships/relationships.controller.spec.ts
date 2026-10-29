import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { AuthGuard } from 'src/common/guards/auth/auth.guard';
import { createValidationPipe } from 'src/common/pipes/validation.pipe';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsService } from './relationships.service';
import { RelationshipType } from './enums/relationship-type.enum';

const ME = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c34';
const OTHER = '7d1e4a2b-5c6f-4b8a-9e0d-2c3b4a5f6e7d';
const RELATIONSHIP_ID = 'b4c3d2e1-a0f9-4e8d-b7c6-5a4b3c2d1e0f';

describe('RelationshipsController', () => {
  let app: INestApplication;
  const relationshipsService = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    blockUser: jest.fn(),
  };
  const ok = { status: HttpStatus.OK, message: 'ok', data: null };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationshipsController],
      providers: [
        { provide: RelationshipsService, useValue: relationshipsService },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => await app.close());
  afterEach(() => jest.resetAllMocks());

  it('returns 401 without calling the service when X-User-Id is missing', async () => {
    await request(app.getHttpServer())
      .post('/relationships')
      .send({ username: 'alice' })
      .expect(HttpStatus.UNAUTHORIZED);

    expect(relationshipsService.create).not.toHaveBeenCalled();
  });

  describe('POST /relationships', () => {
    it('passes the caller id and username to the service', async () => {
      relationshipsService.create.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .post('/relationships')
        .set('X-User-Id', ME)
        .send({ username: 'alice' })
        .expect(HttpStatus.OK);

      expect(relationshipsService.create).toHaveBeenCalledWith(
        ME,
        expect.objectContaining({ username: 'alice' }),
      );
    });

    it.each([
      ['is missing', {}],
      ['is empty', { username: '' }],
    ])('returns 400 when the username %s', async (_, body) => {
      await request(app.getHttpServer())
        .post('/relationships')
        .set('X-User-Id', ME)
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(relationshipsService.create).not.toHaveBeenCalled();
    });
  });

  describe('PUT /relationships/:id', () => {
    it('passes the caller id, route id and body to the service', async () => {
      relationshipsService.update.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .put(`/relationships/${RELATIONSHIP_ID}`)
        .set('X-User-Id', ME)
        .send({ type: RelationshipType.Friends })
        .expect(HttpStatus.OK);

      expect(relationshipsService.update).toHaveBeenCalledWith(
        ME,
        RELATIONSHIP_ID,
        expect.objectContaining({ type: RelationshipType.Friends }),
      );
    });

    it('returns 400 without calling the service when the id is not a UUID', async () => {
      await request(app.getHttpServer())
        .put('/relationships/not-a-uuid')
        .set('X-User-Id', ME)
        .send({ type: RelationshipType.Friends })
        .expect(HttpStatus.BAD_REQUEST);

      expect(relationshipsService.update).not.toHaveBeenCalled();
    });

    // RelationshipType is a numeric enum, and @IsEnum also accepts its member names ('Friends').
    it.each([
      ['is not a RelationshipType value', { type: 99 }],
      ['is the enum name instead of its value', { type: 'Friends' }],
      ['is missing', {}],
    ])('returns 400 when type %s', async (_, body) => {
      await request(app.getHttpServer())
        .put(`/relationships/${RELATIONSHIP_ID}`)
        .set('X-User-Id', ME)
        .send(body)
        .expect(HttpStatus.BAD_REQUEST);

      expect(relationshipsService.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /relationships/:id', () => {
    it('passes the caller id and route id to the service', async () => {
      relationshipsService.remove.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .delete(`/relationships/${RELATIONSHIP_ID}`)
        .set('X-User-Id', ME)
        .expect(HttpStatus.OK);

      expect(relationshipsService.remove).toHaveBeenCalledWith(
        ME,
        RELATIONSHIP_ID,
      );
    });

    it('returns 400 without calling the service when the id is not a UUID', async () => {
      await request(app.getHttpServer())
        .delete('/relationships/not-a-uuid')
        .set('X-User-Id', ME)
        .expect(HttpStatus.BAD_REQUEST);

      expect(relationshipsService.remove).not.toHaveBeenCalled();
    });
  });

  describe('POST /relationships/block/:userId', () => {
    it('passes the caller id and blocked user id to the service', async () => {
      relationshipsService.blockUser.mockResolvedValueOnce(ok);

      await request(app.getHttpServer())
        .post(`/relationships/block/${OTHER}`)
        .set('X-User-Id', ME)
        .expect(HttpStatus.OK);

      expect(relationshipsService.blockUser).toHaveBeenCalledWith(ME, OTHER);
    });

    it('returns 400 without calling the service when the user id is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/relationships/block/not-a-uuid')
        .set('X-User-Id', ME)
        .expect(HttpStatus.BAD_REQUEST);

      expect(relationshipsService.blockUser).not.toHaveBeenCalled();
    });
  });
});
