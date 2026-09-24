import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { UserResponseDTO } from './dto/user-response.dto';
import { Result } from 'src/interfaces/result.interface';
import * as request from 'supertest';

describe('UsersController', () => {
  let app: INestApplication;
  let controller: UsersController;
  const userService: { getById: jest.Mock } = {
    getById: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: userService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => await app.close());
  afterEach(() => jest.resetAllMocks());

  it('GET /users/current returns the user without status in the body', async () => {
    const user = { id: 'me', email: 'me@viscord.app' };
    userService.getById.mockResolvedValueOnce({
      status: HttpStatus.OK,
      data: user,
      message: 'User data retrieved',
    } as Result<UserResponseDTO>);

    const result = await request(app.getHttpServer())
      .get('/users/current')
      .set('X-User-Id', 'me')
      .expect(HttpStatus.OK);

    expect(userService.getById).toHaveBeenCalledWith('me');
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
      .set('X-User-Id', 'missing')
      .expect(HttpStatus.NOT_FOUND);

    expect(result.body).toEqual({ message: 'User not found', data: null });
  });

  it('GET /users/current passes undefined to the service when X-User-Id is missing', async () => {
    userService.getById.mockResolvedValueOnce({
      status: HttpStatus.BAD_REQUEST,
      data: null,
      message: 'Invalid request',
    } as Result<UserResponseDTO>);

    await request(app.getHttpServer())
      .get('/users/current')
      .expect(HttpStatus.BAD_REQUEST);

    expect(userService.getById).toHaveBeenCalledWith(undefined);
  });

  it('GetCurrentUser (gRPC) returns the full result including status', async () => {
    const serviceResult = {
      status: HttpStatus.OK,
      data: { id: 'me', email: 'me@viscord.app' },
      message: 'User data retrieved',
    } as Result<UserResponseDTO>;
    userService.getById.mockResolvedValueOnce(serviceResult);

    const result = await controller.getCurrentUserGRPC({ userId: 'me' });

    expect(userService.getById).toHaveBeenCalledWith('me');
    expect(result).toEqual(serviceResult);
  });
});
