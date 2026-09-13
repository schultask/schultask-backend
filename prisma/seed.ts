import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// (resource, action) pairs used by CASL ability checks — see
// src/casl/casl-ability.factory.ts for the resource -> CASL subject mapping.
const PERMISSIONS: Array<{ resource: string; action: string }> = [
  { resource: 'course', action: 'create' },
  { resource: 'course', action: 'read' },
  { resource: 'course', action: 'update' },
  { resource: 'course', action: 'delete' },
  { resource: 'course', action: 'publish' },
  { resource: 'assignment', action: 'create' },
  { resource: 'assignment', action: 'read' },
  { resource: 'user', action: 'invite' },
  { resource: 'user', action: 'read' },
  { resource: 'user', action: 'update' },
  { resource: 'user', action: 'delete' },
  { resource: 'role', action: 'create' },
  { resource: 'role', action: 'read' },
  { resource: 'role', action: 'update' },
  { resource: 'role', action: 'delete' },
  { resource: 'analytics', action: 'view_org' },
];

// System roles (orgId = null) — shared across every org, not duplicated per
// org. See the comment on the Role model in schema.prisma.
const ROLE_PERMISSIONS: Record<string, Array<{ resource: string; action: string }>> = {
  admin: PERMISSIONS,
  manager: [
    { resource: 'course', action: 'create' },
    { resource: 'course', action: 'read' },
    { resource: 'course', action: 'update' },
    { resource: 'course', action: 'publish' },
    { resource: 'assignment', action: 'create' },
    { resource: 'assignment', action: 'read' },
    { resource: 'user', action: 'invite' },
    { resource: 'user', action: 'read' },
    { resource: 'analytics', action: 'view_org' },
  ],
  // No assignment permission: learners reach their own assignments/enrollments
  // by ownership (GET /assignments/me, /enrollments/me), not org-scoped CASL
  // — see EnrollmentsController.
  learner: [{ resource: 'course', action: 'read' }],
};

async function main() {
  const permissionRecords = await Promise.all(
    PERMISSIONS.map(({ resource, action }) =>
      prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: { resource, action },
      }),
    ),
  );
  const permissionId = (resource: string, action: string) =>
    permissionRecords.find((p) => p.resource === resource && p.action === action)!.id;

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    // Not an upsert: Postgres treats NULL <> NULL, so the (orgId, name)
    // unique constraint doesn't actually dedupe rows where orgId is null —
    // that constraint only does real work for org-owned custom roles.
    const role =
      (await prisma.role.findFirst({ where: { orgId: null, name: roleName } })) ??
      (await prisma.role.create({ data: { orgId: null, name: roleName } }));

    await Promise.all(
      permissions.map(({ resource, action }) =>
        prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: permissionId(resource, action) },
          },
          update: {},
          create: { roleId: role.id, permissionId: permissionId(resource, action) },
        }),
      ),
    );
  }

  console.log('Seeded permissions and system roles: admin, manager, learner');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
