import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Task } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { dateOnlyToDb } from '../common/date-only';
import { toTaskResponse, TaskResponse } from './task-response';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, q: ListTasksQueryDto): Promise<TaskResponse[]> {
    if (q.from && q.to) {
      const tasks = await this.prisma.task.findMany({
        where: {
          ownerId,
          deletedAt: null,
          scheduledOn: { gte: dateOnlyToDb(q.from), lte: dateOnlyToDb(q.to) },
        },
        orderBy: [{ scheduledOn: 'asc' }, { position: 'asc' }],
      });
      return tasks.map(toTaskResponse);
    }
    if (q.themeId && q.backlog) {
      await this.themeOwnedOrThrow(ownerId, q.themeId);
      const tasks = await this.prisma.task.findMany({
        where: {
          ownerId,
          themeId: q.themeId,
          deletedAt: null,
          scheduledOn: null,
        },
        orderBy: { position: 'asc' },
      });
      return tasks.map(toTaskResponse);
    }
    throw new BadRequestException(
      'Provide either from+to (scheduled range) or themeId+backlog=true.',
    );
  }

  async create(ownerId: string, dto: CreateTaskDto): Promise<TaskResponse> {
    await this.themeOwnedOrThrow(ownerId, dto.themeId);
    const last = await this.prisma.task.findFirst({
      where: { ownerId, themeId: dto.themeId, scheduledOn: null, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;
    const task = await this.prisma.task.create({
      data: {
        ownerId,
        themeId: dto.themeId,
        title: dto.title,
        notes: dto.notes,
        bold: dto.bold,
        position,
      },
    });
    return toTaskResponse(task);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    await this.taskOwnedOrThrow(ownerId, id);
    if (dto.themeId !== undefined) {
      await this.themeOwnedOrThrow(ownerId, dto.themeId);
    }
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.bold !== undefined ? { bold: dto.bold } : {}),
        ...(dto.themeId !== undefined ? { themeId: dto.themeId } : {}),
        ...(dto.scheduledOn !== undefined
          ? {
              scheduledOn: dto.scheduledOn ? dateOnlyToDb(dto.scheduledOn) : null,
            }
          : {}),
        ...(dto.daypart !== undefined ? { daypart: dto.daypart } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.done !== undefined
          ? { doneAt: dto.done ? new Date() : null }
          : {}),
      },
    });
    return toTaskResponse(task);
  }

  /** DELETE /api/tasks/:id — soft delete. */
  async softDelete(ownerId: string, id: string): Promise<TaskResponse> {
    await this.taskOwnedOrThrow(ownerId, id);
    const task = await this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toTaskResponse(task);
  }

  /** POST /api/tasks/:id/restore — undo for `softDelete`, backing the front end's Cmd+Z
   *  (D-front-038 / D-back-012). `taskOwnedOrThrow` below does not filter on `deletedAt`, so it
   *  finds the row whether or not it is currently soft-deleted — that is what lets this reach a
   *  task the ordinary owner-scoped list/read paths would already have hidden. 404s the same way
   *  every other task route does when the id doesn't exist or isn't this caller's. */
  async restore(ownerId: string, id: string): Promise<TaskResponse> {
    await this.taskOwnedOrThrow(ownerId, id);
    const task = await this.prisma.task.update({
      where: { id },
      data: { deletedAt: null },
    });
    return toTaskResponse(task);
  }

  private async taskOwnedOrThrow(ownerId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task || task.ownerId !== ownerId) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  private async themeOwnedOrThrow(ownerId: string, themeId: string): Promise<void> {
    const theme = await this.prisma.theme.findUnique({ where: { id: themeId } });
    if (!theme || theme.ownerId !== ownerId) {
      throw new NotFoundException('Theme not found.');
    }
  }
}
