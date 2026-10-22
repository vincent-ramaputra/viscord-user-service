import { createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export const CurrentUserId = createParamDecorator((data: unknown, context) => {
  const request = context.switchToHttp().getRequest<Request>();

  return request.header('X-User-Id');
});
