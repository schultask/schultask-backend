import { Module } from '@nestjs/common';
import { CaslAbilityFactory } from './casl-ability.factory';
import { AbilityGuard } from './ability.guard';

@Module({
  providers: [CaslAbilityFactory, AbilityGuard],
  exports: [CaslAbilityFactory, AbilityGuard],
})
export class CaslModule {}
