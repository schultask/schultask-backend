import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

type AbilityRequest = { ability: AppAbility };

@Controller('assignments')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @CheckAbility('create', 'Assignment')
  create(
    @Req() req: AbilityRequest,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(req.ability, user.orgId, user.id, dto);
  }

  @Get()
  @CheckAbility('read', 'Assignment')
  findAll(@Req() req: AbilityRequest) {
    return this.assignments.findAll(req.ability);
  }

  // Self-scoped by ownership — must be registered before ':id' or Express
  // would match "me" as the :id param instead.
  @Get('me')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.assignments.findMine(user.id);
  }

  @Get(':id')
  @CheckAbility('read', 'Assignment')
  findOne(@Req() req: AbilityRequest, @Param('id') id: string) {
    return this.assignments.findOne(req.ability, id);
  }
}
