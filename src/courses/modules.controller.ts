import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AbilityGuard } from '../casl/ability.guard';
import { CheckAbility } from '../casl/check-ability.decorator';
import { AppAbility } from '../casl/casl-ability.factory';
import { CoursesService } from './courses.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';

type AbilityRequest = { ability: AppAbility };

// Modules have no org_id of their own — every route here resolves the
// parent course through CoursesService, which is what actually enforces
// org scoping (see the comment on Module in schema.prisma).
@Controller('courses/:courseId/modules')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ModulesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @CheckAbility('update', 'Course')
  create(@Req() req: AbilityRequest, @Param('courseId') courseId: string, @Body() dto: CreateModuleDto) {
    return this.courses.createModule(req.ability, courseId, dto);
  }

  @Patch(':moduleId')
  @CheckAbility('update', 'Course')
  update(
    @Req() req: AbilityRequest,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.courses.updateModule(req.ability, courseId, moduleId, dto);
  }

  @Delete(':moduleId')
  @HttpCode(204)
  @CheckAbility('update', 'Course')
  remove(
    @Req() req: AbilityRequest,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
  ) {
    return this.courses.removeModule(req.ability, courseId, moduleId);
  }
}
