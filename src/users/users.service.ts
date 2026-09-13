import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { InviteUserDto } from './dto/invite-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(orgId: string, dto: InviteUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const role = await this.prisma.role.findFirst({ where: { orgId: null, name: dto.role } });
    if (!role) {
      throw new InternalServerErrorException(
        'System roles are not seeded — run `pnpm prisma:seed` first',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { orgId, email: dto.email, name: dto.name, passwordHash },
      });
      await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
      return created;
    });

    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }
}
