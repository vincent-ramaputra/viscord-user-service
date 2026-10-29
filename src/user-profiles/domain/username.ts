import { applyDecorators } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;
export const USERNAME_MESSAGE =
  'Username can only contain letters, numbers, underscores and periods';
export const USERNAME_LENGTH_MESSAGE =
  'Username must be between 2 and 32 characters long';
export const USERNAME_TAKEN_MESSAGE = 'This username is already used';

export const normalizeUsername = (username: string) => username.toLowerCase();
export const IsUsername = () => {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' ? normalizeUsername(value) : value,
    ),
    IsString(),
    Length(2, 32, { message: USERNAME_LENGTH_MESSAGE }),
    Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE }),
  );
};
