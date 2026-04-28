import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  Headers,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Response } from 'express';
import { GrpcMethod } from '@nestjs/microservices';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('current')
  async getCurrentUser(
    @Headers('X-User-Id') userId: string,
    @Res() res: Response,
  ) {
    const result = await this.usersService.getById(userId);
    const { status, ...body } = result;
    return res.status(status).json(body);
  }

  @GrpcMethod('UsersService', 'GetCurrentUser')
  async getCurrentUserGRPC({ userId }: { userId: string }) {
    return await this.usersService.getById(userId);
  }

}
