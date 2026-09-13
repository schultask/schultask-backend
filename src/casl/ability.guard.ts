import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_ABILITY_KEY, RequiredAbility } from './check-ability.decorator';

@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredAbility | undefined>(
      CHECK_ABILITY_KEY,
      context.getHandler(),
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const ability = await this.abilityFactory.createForUser(request.user.id);
    request.ability = ability;

    if (!ability.can(required.action, required.subject)) {
      throw new ForbiddenException(
        `Missing permission: ${required.action} on ${required.subject}`,
      );
    }
    return true;
  }
}
