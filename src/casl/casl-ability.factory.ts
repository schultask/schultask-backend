import { Injectable } from '@nestjs/common';
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility, PrismaAbility, Subjects } from '@casl/prisma';
import { Assignment, Course, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Resources without a Prisma model yet stay plain strings — CASL doesn't
// require a queryable model to check `ability.can`, only `accessibleBy`
// (used for org-scoped list/read queries) does. Course/Assignment must be
// mapped here (not left as bare strings) or accessibleBy(ability, action)
// returns no where-clause and every list/fetch leaks cross-org. Module,
// Lesson, AssignmentTarget, and Enrollment have no org_id of their own
// (see schema.prisma) and are deliberately NOT permission resources — they
// stay reachable only by resolving their parent Course/Assignment first.
export type AppSubjects =
  | Subjects<{ User: User; Course: Course; Assignment: Assignment }>
  | 'Role'
  | 'Analytics'
  | 'all';
export type AppAbility = PrismaAbility<[string, AppSubjects]>;

// Every permission resource must declare how accessibleBy() scopes its rows
// — deliberately no default. Adding a permission in seed.ts without adding
// it here throws immediately (at ability-build time) instead of silently
// granting unconditioned, cross-org access via `undefined` conditions.
//   'org'         — row has orgId; condition is { orgId: user.orgId }.
//   'org-or-null' — row's orgId may be null for a shared/system record
//                   (e.g. system roles) that must stay visible to everyone.
//   'none'        — capability-only permission, no row-level data to scope.
const SCOPE_STRATEGY: Record<string, 'org' | 'org-or-null' | 'none'> = {
  user: 'org',
  course: 'org',
  assignment: 'org',
  role: 'org-or-null',
  analytics: 'none',
};

function conditionsFor(resource: string, orgId: string): Record<string, unknown> | undefined {
  const strategy = SCOPE_STRATEGY[resource];
  if (!strategy) {
    throw new Error(
      `No SCOPE_STRATEGY entry for resource "${resource}" — add one before seeding this permission.`,
    );
  }
  switch (strategy) {
    case 'org':
      return { orgId };
    case 'org-or-null':
      return { OR: [{ orgId }, { orgId: null }] };
    case 'none':
      return undefined;
  }
}

function resourceToSubject(resource: string): AppSubjects {
  switch (resource) {
    case 'user':
      return 'User';
    case 'course':
      return 'Course';
    case 'assignment':
      return 'Assignment';
    case 'role':
      return 'Role';
    case 'analytics':
      return 'Analytics';
    default:
      throw new Error(`Unknown permission resource: ${resource}`);
  }
}

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string): Promise<AppAbility> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    });

    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

    for (const userRole of user.userRoles) {
      for (const { permission } of userRole.role.rolePermissions) {
        const subject = resourceToSubject(permission.resource);
        const conditions = conditionsFor(permission.resource, user.orgId);
        // Subject type is data-driven (loaded from role_permissions), so it
        // can't be narrowed to a literal at compile time the way a call site
        // like `@CheckAbility('read', 'User')` can — that's where the
        // AppSubjects union is actually enforced.
        (can as (action: string, subject: unknown, conditions?: unknown) => void)(
          permission.action,
          subject,
          conditions,
        );
      }
    }

    return build();
  }
}
