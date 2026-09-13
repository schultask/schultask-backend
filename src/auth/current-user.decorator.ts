import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentUserPayload = { id: string; orgId: string };

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
