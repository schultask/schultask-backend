import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { accessibleBy } from '@casl/prisma';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  // Org-scoping proof: the `read`/`User` ability carries `{ orgId }` as a
  // condition (see CaslAbilityFactory), and accessibleBy() turns that
  // straight into this query's Prisma `where` — the same CASL check that
  // gates access to the endpoint is what scopes the rows it returns.
  @Get()
  @CheckAbility('read', 'User')
  async findAll(@Req() req: { ability: AppAbility }) {
    return this.prisma.user.findMany({
      where: accessibleBy(req.ability, 'read').User,
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  @Post()
  @CheckAbility('invite', 'User')
  invite(@CurrentUser() user: CurrentUserPayload, @Body() dto: InviteUserDto) {
    return this.users.invite(user.orgId, dto);
  }
}
