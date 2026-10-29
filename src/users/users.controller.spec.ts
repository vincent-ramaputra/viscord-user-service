import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { UserResponseDTO } from './dto/user-response.dto';
import { Result } from 'src/interfaces/result.interface';
import * as request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from 'src/common/guards/auth/auth.guard';

const ME = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c34';
const MISSING = '9a7c2d4e-1b3f-4c5a-8d6e-0f1a2b3c4d5e';

describe('UsersController', () => {
  let app: INestApplication;
  let controller: UsersController;
  const userService: { getById: jest.Mock } = {
    getById: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: userService },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => await app.close());
  afterEach(() => jest.resetAllMocks());

  it('GET /users/current returns the user without status in the body', async () => {
    const user = { id: ME, email: 'me@viscord.app' };
    userService.getById.mockResolvedValueOnce({
      status: HttpStatus.OK,
      data: user,
      message: 'User data retrieved',
    } as Result<UserResponseDTO>);

    const result = await request(app.getHttpServer())
      .get('/users/current')
      .set('X-User-Id', ME)
      .expect(HttpStatus.OK);

    expect(userService.getById).toHaveBeenCalledWith(ME);
    expect(result.body).toEqual({ message: 'User data retrieved', data: user });
  });

  it('GET /users/current uses the status from the service result as the HTTP status', async () => {
    userService.getById.mockResolvedValueOnce({
      status: HttpStatus.NOT_FOUND,
      data: null,
      message: 'User not found',
    } as Result<UserResponseDTO>);

    const result = await request(app.getHttpServer())
      .get('/users/current')
      .set('X-User-Id', MISSING)
      .expect(HttpStatus.NOT_FOUND);

    expect(result.body).toEqual({ message: 'User not found', data: null });
  });

  it('GET /users/current returns 401 without calling the service when X-User-Id is missing', async () => {
    await request(app.getHttpServer())
      .get('/users/current')
      .expect(HttpStatus.UNAUTHORIZED);

    expect(userService.getById).not.toHaveBeenCalled();
  });

  it('GetCurrentUser (gRPC) returns the full result including status', async () => {
    const serviceResult = {
      status: HttpStatus.OK,
      data: { id: ME, email: 'me@viscord.app' },
      message: 'User data retrieved',
    } as Result<UserResponseDTO>;
    userService.getById.mockResolvedValueOnce(serviceResult);

    const result = await controller.getCurrentUserGRPC({ userId: ME });

    expect(userService.getById).toHaveBeenCalledWith(ME);
    expect(result).toEqual(serviceResult);
  });
});
