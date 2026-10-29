import {
  Controller,
  ExecutionContext,
  Get,
  HttpStatus,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthGuard } from './auth.guard';

const USER_ID = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c34';

describe('AuthGuard', () => {
  describe('canActivate', () => {
    let guard: AuthGuard;
    let reflector: Reflector;
    const header = jest.fn();

    const createContext = (type: string): ExecutionContext =>
      ({
        getType: () => type,
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => ({ header }) }),
      }) as unknown as ExecutionContext;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new AuthGuard(reflector);
      header.mockReset();
    });

    afterEach(() => jest.restoreAllMocks());

    it.each(['rpc', 'ws'])(
      'allows %s contexts without reading the request',
      (type) => {
        expect(guard.canActivate(createContext(type))).toBe(true);
        expect(header).not.toHaveBeenCalled();
      },
    );

    it('allows public handlers without an X-User-Id header', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      header.mockReturnValue(undefined);

      expect(guard.canActivate(createContext('http'))).toBe(true);
    });

    it('allows requests with an X-User-Id header', () => {
      header.mockReturnValue(USER_ID);

      expect(guard.canActivate(createContext('http'))).toBe(true);
      expect(header).toHaveBeenCalledWith('X-User-Id');
    });

    it('throws UnauthorizedException when X-User-Id is missing', () => {
      header.mockReturnValue(undefined);

      expect(() => guard.canActivate(createContext('http'))).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when X-User-Id is not a UUID', () => {
      header.mockReturnValue('user-1');

      expect(() => guard.canActivate(createContext('http'))).toThrow(
        UnauthorizedException,
      );
    });
  });

  // Goes through a real HTTP request so Node's header lowercasing is exercised,
  // which a hand-built request object can't catch.
  describe('over HTTP', () => {
    @Controller('test')
    class TestController {
      @Get('private')
      private() {
        return 'ok';
      }

      @Public()
      @Get('public')
      public() {
        return 'ok';
      }
    }

    @Public()
    @Controller('public-class')
    class PublicClassController {
      @Get()
      get() {
        return 'ok';
      }
    }

    let app: INestApplication;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        controllers: [TestController, PublicClassController],
        providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
      }).compile();

      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => await app.close());

    it('returns 401 when X-User-Id is missing', async () => {
      await request(app.getHttpServer())
        .get('/test/private')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 401 when X-User-Id is empty', async () => {
      await request(app.getHttpServer())
        .get('/test/private')
        .set('X-User-Id', '')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 401 when X-User-Id is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/test/private')
        .set('X-User-Id', 'abc')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each(['X-User-Id', 'x-user-id'])(
      'accepts the header sent as %s',
      async (name) => {
        await request(app.getHttpServer())
          .get('/test/private')
          .set(name, USER_ID)
          .expect(HttpStatus.OK);
      },
    );

    it('allows a @Public() handler without X-User-Id', async () => {
      await request(app.getHttpServer())
        .get('/test/public')
        .expect(HttpStatus.OK);
    });

    it('allows every handler on a @Public() controller without X-User-Id', async () => {
      await request(app.getHttpServer())
        .get('/public-class')
        .expect(HttpStatus.OK);
    });
  });
});
