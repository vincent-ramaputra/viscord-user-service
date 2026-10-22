import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { Public } from 'src/common/decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride(Public, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    if (!context.switchToHttp().getRequest<Request>().header('X-User-Id')) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
