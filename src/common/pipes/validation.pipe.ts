import {
  BadRequestException,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';

// Shared by main.ts and the controller specs so tests validate requests exactly like the app does.
export const createValidationPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const message =
        Object.values(errors[0]?.constraints ?? {})[0] ?? 'Invalid request';

      return new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message,
        data: null,
      });
    },
  });
