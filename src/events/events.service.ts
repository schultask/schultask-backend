import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // orgId/userId always come from the JWT (the caller), never the request
  // body — an event is a first-person record of "this user did this," and
  // accepting either field from the client would let anyone log events as
  // someone else or into another org's analytics.
  async record(orgId: string, userId: string, dto: CreateEventDto) {
    return this.prisma.learningEvent.create({
      data: {
        orgId,
        userId,
        verb: dto.verb,
        objectType: dto.objectType,
        objectId: dto.objectId,
        result: dto.result as Prisma.InputJsonValue,
        context: dto.context as Prisma.InputJsonValue,
      },
    });
  }
}
