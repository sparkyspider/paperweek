import { ConflictException, NotFoundException } from '@nestjs/common';
import { ThemesService } from './themes.service';
import { PrismaService } from '../core/prisma/prisma.service';

/**
 * ThemesService.hardDelete (084-Q8): an agent may hard delete its OWN theme, and the theme's tasks
 * go with it. Every refusal must delete NOTHING: a theme that is someone else's or does not exist
 * answers 404 before any delete runs, and a theme holding another person's task answers 409.
 */
function build() {
  const tx = {
    theme: { findUnique: jest.fn(), deleteMany: jest.fn() },
    task: { count: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const service = new ThemesService(prisma as unknown as PrismaService);
  return { service, tx };
}

describe('ThemesService.hardDelete', () => {
  it("deletes the caller's own theme and only the caller's tasks under it", async () => {
    const { service, tx } = build();
    tx.theme.findUnique.mockResolvedValue({ id: 'th1', ownerId: 'agent-1' });
    tx.task.count.mockResolvedValue(0);
    tx.task.deleteMany.mockResolvedValue({ count: 3 });
    tx.theme.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.hardDelete('agent-1', 'th1')).resolves.toEqual({
      id: 'th1',
      tasksDeleted: 3,
    });
    expect(tx.task.deleteMany).toHaveBeenCalledWith({
      where: { themeId: 'th1', ownerId: 'agent-1' },
    });
    expect(tx.theme.deleteMany).toHaveBeenCalledWith({
      where: { id: 'th1', ownerId: 'agent-1' },
    });
  });

  it('404s a theme owned by someone else and deletes nothing', async () => {
    const { service, tx } = build();
    tx.theme.findUnique.mockResolvedValue({ id: 'th1', ownerId: 'member-099' });

    await expect(service.hardDelete('agent-1', 'th1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.task.deleteMany).not.toHaveBeenCalled();
    expect(tx.theme.deleteMany).not.toHaveBeenCalled();
  });

  it('404s a theme that does not exist and deletes nothing', async () => {
    const { service, tx } = build();
    tx.theme.findUnique.mockResolvedValue(null);

    await expect(
      service.hardDelete('agent-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.task.deleteMany).not.toHaveBeenCalled();
    expect(tx.theme.deleteMany).not.toHaveBeenCalled();
  });

  it("409s when the theme holds another person's task, and deletes nothing", async () => {
    const { service, tx } = build();
    tx.theme.findUnique.mockResolvedValue({ id: 'th1', ownerId: 'agent-1' });
    tx.task.count.mockResolvedValue(1);

    await expect(service.hardDelete('agent-1', 'th1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.task.count).toHaveBeenCalledWith({
      where: { themeId: 'th1', NOT: { ownerId: 'agent-1' } },
    });
    expect(tx.task.deleteMany).not.toHaveBeenCalled();
    expect(tx.theme.deleteMany).not.toHaveBeenCalled();
  });

  it('404s (and the transaction rolls back) if the owner-scoped theme delete removes no row', async () => {
    const { service, tx } = build();
    tx.theme.findUnique.mockResolvedValue({ id: 'th1', ownerId: 'agent-1' });
    tx.task.count.mockResolvedValue(0);
    tx.task.deleteMany.mockResolvedValue({ count: 0 });
    tx.theme.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.hardDelete('agent-1', 'th1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
