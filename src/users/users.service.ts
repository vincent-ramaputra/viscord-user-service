import { Get, Headers, HttpStatus, Injectable, Param } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfilesService } from 'src/user-profiles/user-profiles.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { Result } from 'src/interfaces/result.interface';
import { UserResponseDTO } from './dto/user-response.dto';
import { UserProfileResponseDTO } from 'src/user-profiles/dto/user-profile-response.dto';
import { mapper } from 'src/mappings/mappers';
import { AxiosResponse } from 'axios';
import { MessagePattern } from '@nestjs/microservices';
import { UserIdentityResponseDTO } from './dto/user-identity-response.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly userProfilesService: UserProfilesService,
    private readonly authService: HttpService,
  ) {}

  async getById(id: string): Promise<Result<UserResponseDTO>> {
    if (!id || id.length == 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'Invalid request',
      };
    }
    console.log(id);
    const userProfileResponse: Result<UserProfileResponseDTO> =
      await this.userProfilesService.getById(id);

    if (userProfileResponse.status !== HttpStatus.OK) {
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'Failed retrieving user profile',
      };
    }

    let userIdentityResponse: AxiosResponse<any, any>;

    try {
      const url = `http://${process.env.AUTH_SERVICE_HOST}:${process.env.AUTH_SERVICE_PORT}/auth/user/${id}`;
      userIdentityResponse = await firstValueFrom(this.authService.get(url));
      if (userIdentityResponse.status !== HttpStatus.OK) {
        return {
          status: HttpStatus.BAD_REQUEST,
          data: null,
          message: 'Failed retrieving user identity',
        };
      }
    } catch (error) {
      return {
        status: HttpStatus.BAD_REQUEST,
        data: null,
        message: 'Failed retrieving user identity',
      };
    }

    return {
      status: HttpStatus.OK,
      message: 'User data retrieved successfully',
      data: {
        ...userIdentityResponse.data.data,
        profile: userProfileResponse.data,
      },
    };
  }

  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user';
  }

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
