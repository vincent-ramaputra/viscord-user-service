import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Headers,
  Res,
  ValidationPipe,
  Put,
} from '@nestjs/common';
import { RelationshipsService } from './relationships.service';
import { CreateRelationshipDto } from './dto/create-relationship.dto';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';
import { Response } from 'express';
import { EventPattern, GrpcMethod } from '@nestjs/microservices';
import { USER_OFFLINE_EVENT, USER_ONLINE_EVENT } from 'src/constants/events';

@Controller('relationships')
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Post()
  async create(
    @Headers('X-User-Id') senderId: string,
    @Body(new ValidationPipe({ transform: true }))
    createDTO: CreateRelationshipDto,
    @Res() res: Response,
  ) {
    const result = await this.relationshipsService.create(senderId, createDTO);
    const { status } = result;

    return res.status(status).json(result);
  }

  @Get()
  async findAll(@Headers('X-User-Id') userId: string, @Res() res: Response) {
    const result = await this.relationshipsService.findAll(userId);
    const { status } = result;

    return res.status(status).json(result);
  }

  @GrpcMethod('RelationshipsService', 'GetRelationships')
  async findAllGRPC({ userId }: { userId: string }) {
    const response = await this.relationshipsService.findAll(userId);
    return response;
  }

  @Post('block/:userId')
  async blockUser(
    @Headers('X-User-Id') userId: string,
    @Param('userId') blockedUserId: string,
    @Res() res: Response,
  ) {
    const result = await this.relationshipsService.blockUser(
      userId,
      blockedUserId,
    );
    const { status } = result;

    return res.status(status).json(result);
  }

  @Put(':id')
  async update(
    @Headers('X-User-Id') userId: string,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true }))
    updateRelationshipDto: UpdateRelationshipDto,
    @Res() res: Response,
  ) {
    const result = await this.relationshipsService.update(
      userId,
      id,
      updateRelationshipDto,
    );
    const { status } = result;

    return res.status(status).json(result);
  }

  @Delete(':id')
  async remove(
    @Headers('X-User-Id') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const result = await this.relationshipsService.remove(userId, id);
    const { status } = result;

    return res.status(status).json(result);
  }

  @EventPattern(USER_ONLINE_EVENT)
  async handleUserOnline(@Body() userId: string) {
    await this.relationshipsService.onUserOnline(userId);
  }

  @EventPattern(USER_OFFLINE_EVENT)
  async handleUserOffline(@Body() userId: string) {
    await this.relationshipsService.onUserOffline(userId);
  }

  @GrpcMethod('RelationshipsService', 'GetVisibleUsers')
  async handleGetVisibleUsers({ userId }: { userId: string }) {
    return this.relationshipsService.onGetVisibleUsers(userId);
  }
}
