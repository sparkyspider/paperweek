import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../core/prisma/prisma.service';

/**
 * TasksService.restore — the Cmd+Z undo path for `softDelete` (D-back-012 / D-front-038). The
 * scoping contract that matters here: it must find a row that is ALREADY soft-deleted (the
 * ordinary owner-scoped read paths hide those on purpose), but must still 404 exactly like
 * every other task route when the task belongs to someone else or doesn't exist at all — an
 * undo route is not a back door around per-owner scoping.
 */
function buildService(prisma: {
  task: { findUnique: jest.Mock; update: jest.Mock };
}): TasksService {
  return new TasksService(prisma as unknown as PrismaService);
}

describe('TasksService.restore', () => {
  it('clears deletedAt on a soft-deleted task owned by the caller', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 't1', ownerId: 'owner-1', deletedAt: new Date('2026-09-20') });
    const update = jest.fn().mockResolvedValue({
      id: 't1',
      ownerId: 'owner-1',
      themeId: 'theme-1',
      title: 'Undo me',
      notes: null,
      scheduledOn: null,
      daypart: null,
      position: 0,
      doneAt: null,
      deletedAt: null,
      bold: false,
      createdAt: new Date('2026-09-20'),
      updatedAt: new Date('2026-09-21'),
    });
    const service = buildService({ task: { findUnique, update } });

    const result = await service.restore('owner-1', 't1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { deletedAt: null } });
    expect(result.deletedAt).toBeNull();
  });

  it('404s a task owned by someone else, without ever calling update', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 't1', ownerId: 'someone-else', deletedAt: new Date() });
    const update = jest.fn();
    const service = buildService({ task: { findUnique, update } });

    await expect(service.restore('owner-1', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('404s when the task does not exist at all', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const update = jest.fn();
    const service = buildService({ task: { findUnique, update } });

    await expect(service.restore('owner-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * TasksService.hardDelete (084-Q8): an agent may hard delete its OWN task. Ownership sits in the
 * delete statement itself (`id` AND `ownerId`), so another person's row is never matched; when
 * nothing is removed the answer is the ordinary 404.
 */
describe('TasksService.hardDelete', () => {
  function build(count: number) {
    const deleteMany = jest.fn().mockResolvedValue({ count });
    const service = new TasksService({ task: { deleteMany } } as unknown as PrismaService);
    return { service, deleteMany };
  }

  it("deletes the caller's own task, scoped on id AND owner", async () => {
    const { service, deleteMany } = build(1);

    await expect(service.hardDelete('agent-1', 't1')).resolves.toEqual({ id: 't1' });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 't1', ownerId: 'agent-1' } });
  });

  it('404s when the task is someone else\'s or missing (the owner-scoped delete matched nothing)', async () => {
    const { service, deleteMany } = build(0);

    await expect(service.hardDelete('agent-1', 'member-099-task')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'member-099-task', ownerId: 'agent-1' },
    });
  });
});
