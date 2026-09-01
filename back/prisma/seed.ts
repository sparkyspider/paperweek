import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds/reconciles Mark's (mark@flyh2.com) starter themes — soft watercolor palette, one per
 * life area (SPEC.md). Tarryn is not seeded: she creates her own once her Zitadel user exists
 * (see auth/add-user.sh).
 *
 * Requires MARK_ZITADEL_USER_ID in the environment — the Zitadel user id (JWT `sub`) for
 * mark@flyh2.com, printed by `auth/bootstrap-productivity.sh` / `auth/add-user.sh`.
 *
 * Idempotent AND self-healing: existing canonical themes have their `position`/`color`
 * reconciled to this list (not just skipped) so re-running after a lineup revision fixes
 * ordering on a database seeded under an older list, matching by (ownerId, name).
 */
const THEMES: { name: string; color: string }[] = [
  { name: 'FlyH2', color: '#AFCBE3' }, // sky blue
  { name: 'Co-Sy', color: '#A8D5BA' }, // teal
  { name: 'Positive Polar', color: '#C7EDE4' }, // glacial ice-blue/mint — distinct from FlyH2's sky blue
  { name: 'RT7 Digital', color: '#E3AE96' }, // coral / terracotta
  { name: 'Life Balance', color: '#C9C2E8' }, // lavender
  { name: 'Admin', color: '#D9C7C0' }, // warm grey-rose
  { name: 'Personal', color: '#C8C29B' }, // warm sand/sage — the catch-all
];

/** Absorbed into Admin (coordinator directive) — soft-archived, never hard-deleted. */
const ARCHIVED_THEMES = ['Budgets & Tax'];

async function main() {
  const ownerId = process.env.MARK_ZITADEL_USER_ID;
  if (!ownerId) {
    throw new Error(
      'MARK_ZITADEL_USER_ID is not set — run auth/bootstrap-productivity.sh (or ' +
        'auth/add-user.sh) first and export the printed user id before seeding.',
    );
  }

  for (const [i, t] of THEMES.entries()) {
    const existing = await prisma.theme.findFirst({
      where: { ownerId, name: t.name },
    });
    if (existing) {
      if (existing.position !== i || existing.color !== t.color) {
        await prisma.theme.update({
          where: { id: existing.id },
          data: { position: i, color: t.color },
        });
        console.log(`theme "${t.name}" reconciled (position=${i})`);
      } else {
        console.log(`theme "${t.name}" already up to date — skipping`);
      }
      continue;
    }
    await prisma.theme.create({
      data: { ownerId, name: t.name, color: t.color, position: i },
    });
    console.log(`theme "${t.name}" created for ${ownerId}`);
  }

  for (const name of ARCHIVED_THEMES) {
    const existing = await prisma.theme.findFirst({ where: { ownerId, name } });
    if (!existing) continue;
    if (existing.archivedAt) {
      console.log(`theme "${name}" already archived — skipping`);
      continue;
    }
    await prisma.theme.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
    console.log(`theme "${name}" archived (absorbed into Admin)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
