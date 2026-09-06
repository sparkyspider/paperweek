import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Theme } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';

/** Fallback palette when a theme is created with no `color` — soft watercolor tones,
 *  matching the seeded set (SPEC.md "watercolor blob swatches per theme"). */
const DEFAULT_COLORS = [
  '#AFCBE3',
  '#A8D5BA',
  '#C7EDE4',
  '#E3AE96',
  '#C9C2E8',
  '#D9C7C0',
  '#C8C29B',
];

@Injectable()
export class ThemesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, includeArchived: boolean): Promise<Theme[]> {
    return this.prisma.theme.findMany({
      where: { ownerId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { position: 'asc' },
    });
  }

  async create(ownerId: string, dto: CreateThemeDto): Promise<Theme> {
    const last = await this.prisma.theme.findFirst({
      where: { ownerId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;
    const color =
      dto.color ?? DEFAULT_COLORS[position % DEFAULT_COLORS.length];
    return this.prisma.theme.create({
      data: { ownerId, name: dto.name, color, position },
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateThemeDto,
  ): Promise<Theme> {
    await this.ownedOrThrow(ownerId, id);
    return this.prisma.theme.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.archived !== undefined
          ? { archivedAt: dto.archived ? new Date() : null }
          : {}),
      },
    });
  }

  /** PUT /api/themes/order — reorder the caller's active themes in one transaction. `ids` must
   *  be exactly the caller's current active (non-archived) theme id set, in the desired order —
   *  anything short of that (a missing id, one belonging to someone else, a duplicate) is
   *  rejected outright rather than silently reordering a partial list, which would leave gaps or
   *  collisions in `position` for the ids left out. On success, `position` is set to each id's
   *  index in the array. Sibling shifting for the single-row `PATCH .../:id { position }` path
   *  is intentionally NOT implemented — that endpoint sets one row's `position` verbatim (its
   *  existing, pre-drag-and-drop behaviour); this endpoint is the one drag-to-reorder writes
   *  through. */
  async reorder(ownerId: string, ids: string[]): Promise<Theme[]> {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.theme.findMany({
        where: { ownerId, archivedAt: null },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((t) => t.id));
      const isExactMatch =
        ids.length === ownedIds.size && ids.every((id) => ownedIds.has(id));
      if (!isExactMatch) {
        throw new BadRequestException(
          "ids must be exactly the caller's current set of active themes, with no duplicates or omissions.",
        );
      }
      await Promise.all(
        ids.map((id, position) =>
          tx.theme.update({ where: { id }, data: { position } }),
        ),
      );
      return tx.theme.findMany({
        where: { ownerId, archivedAt: null },
        orderBy: { position: 'asc' },
      });
    });
  }

  /** DELETE /api/themes/:id — soft archive (same as PATCH { archived: true }). */
  async archive(ownerId: string, id: string): Promise<Theme> {
    await this.ownedOrThrow(ownerId, id);
    return this.prisma.theme.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  private async ownedOrThrow(ownerId: string, id: string): Promise<void> {
    const theme = await this.prisma.theme.findUnique({ where: { id } });
    if (!theme || theme.ownerId !== ownerId) {
      throw new NotFoundException('Theme not found.');
    }
  }
}
