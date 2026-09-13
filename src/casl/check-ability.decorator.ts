import { SetMetadata } from '@nestjs/common';
import { AppSubjects } from './casl-ability.factory';

export const CHECK_ABILITY_KEY = 'check_ability';

export type RequiredAbility = { action: string; subject: AppSubjects };

export const CheckAbility = (action: string, subject: AppSubjects) =>
  SetMetadata(CHECK_ABILITY_KEY, { action, subject } satisfies RequiredAbility);
