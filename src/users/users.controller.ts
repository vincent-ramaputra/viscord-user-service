import { Controller, Get, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { Response } from 'express';
import { GrpcMethod } from '@nestjs/microservices';
import { CurrentUserId } from 'src/common/decorators/current-user-id.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('current')
  async getCurrentUser(@CurrentUserId() userId: string, @Res() res: Response) {
    const result = await this.usersService.getById(userId);
    const { status, ...body } = result;
    return res.status(status).json(body);
  }

  @GrpcMethod('UsersService', 'GetCurrentUser')
  async getCurrentUserGRPC({ userId }: { userId: string }) {
    return await this.usersService.getById(userId);
  }
}
