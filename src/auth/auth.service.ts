import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const REFRESH_KEY_PREFIX = 'refresh:';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const adminRole = await this.prisma.role.findFirst({
      where: { orgId: null, name: 'admin' },
    });
    if (!adminRole) {
      throw new InternalServerErrorException(
        'System roles are not seeded — run `pnpm prisma:seed` first',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: dto.orgName } });
      const created = await tx.user.create({
        data: { orgId: org.id, email: dto.email, name: dto.name, passwordHash },
      });
      await tx.userRole.create({ data: { userId: created.id, roleId: adminRole.id } });
      return created;
    });

    return this.issueTokens(user.id, user.orgId);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user.id, user.orgId);
  }

  async refresh(refreshToken: string) {
    const userId = await this.redis.get(REFRESH_KEY_PREFIX + refreshToken);
    if (!userId) throw new UnauthorizedException('Invalid or expired refresh token');

    await this.redis.del(REFRESH_KEY_PREFIX + refreshToken);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.issueTokens(user.id, user.orgId);
  }

  async logout(refreshToken: string) {
    await this.redis.del(REFRESH_KEY_PREFIX + refreshToken);
  }

  private async issueTokens(userId: string, orgId: string) {
    const accessToken = this.jwt.sign(
      { sub: userId, orgId },
      { expiresIn: '15m', secret: this.config.getOrThrow('JWT_SECRET') },
    );

    const refreshToken = randomBytes(32).toString('hex');
    await this.redis.set(REFRESH_KEY_PREFIX + refreshToken, userId, 'EX', REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken };
  }
}
