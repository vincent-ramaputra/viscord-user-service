import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ValidationPipe,
  Req,
  Res,
  Headers,
} from '@nestjs/common';
import { UserProfilesService } from './user-profiles.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUsernameDTO } from 'src/users/dto/update-username.dto';
import { Response } from 'express';
import { UpdateStatusDTO } from 'src/users/dto/update-status.dto';
import { GrpcMethod } from '@nestjs/microservices';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Controller('user-profiles')
export class UserProfilesController {
  constructor(private readonly userProfilesService: UserProfilesService) {}

  @Post()
  async create(
    @Req() request: Request,
    @Body(new ValidationPipe({ transform: true }))
    createUserProfileDto: CreateUserProfileDto,
    @Res() res: Response,
  ) {
    const result = await this.userProfilesService.create(createUserProfileDto);
    const { status } = result;

    return res.status(status).json(result);
  }

  @Patch('username')
  async updateUsername(
    @Headers('X-User-Id') id: string,
    @Req() request: Request,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateUsernameDTO,
    @Res() res: Response,
  ) {
    const result = await this.userProfilesService.updateUsername(id, dto);
    const { status } = result;

    return res.status(status).json(result);
  }

  @Get('username/:username')
  async getByUsername(
    @Headers('X-User-Id') id: string,
    @Res() res: Response,
    @Param('username') username: string,
  ) {
    const result =
      await this.userProfilesService.getProfileByUsername(username);
    const { status } = result;

    return res.status(status).json(result);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Res() res: Response) {
    const result = await this.userProfilesService.getById(id);
    const { status } = result;

    return res.status(status).json(result);
  }

  @Patch('status')
  async updateStatus(
    @Headers('X-User-Id') id: string,
    @Res() res: Response,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateStatusDTO,
  ) {
    dto.userId = id;
    const result = await this.userProfilesService.updateStatus(dto);
    const { status } = result;

    return res.status(status).json(result);
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   // return this.userProfilesService.remove(+id);
  // }

  @Patch()
  async updateProfile(
    @Headers('X-User-Id') id: string,
    @Res() res: Response,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateUserProfileDto,
  ) {
    dto.id = id;
    const result = await this.userProfilesService.updateUserProfile(dto);
    const { status } = result;

    return res.status(status).json(result);
  }

  @GrpcMethod('UserProfilesService', 'GetUserProfiles')
  async getUserProfiles(
    @Res() res: Response,
    @Body(new ValidationPipe({ transform: true })) dto: { userIds: string[] },
  ) {
    return await this.userProfilesService.getUserProfiles(dto.userIds);
  }
}
