import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  Headers,
  ValidationPipe,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Response } from 'express';
import {
  ClientProxy,
  ClientProxyFactory,
  GrpcMethod,
  Transport,
} from '@nestjs/microservices';
import { StorageService } from 'src/storage/storage.service';

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

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}
