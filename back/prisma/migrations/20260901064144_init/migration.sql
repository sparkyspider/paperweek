-- CreateEnum
CREATE TYPE "Daypart" AS ENUM ('morning', 'afternoon', 'evening');

-- CreateTable
CREATE TABLE "theme" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "scheduled_on" DATE,
    "daypart" "Daypart",
    "position" INTEGER NOT NULL,
    "done_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "theme_owner_id_idx" ON "theme"("owner_id");

-- CreateIndex
CREATE INDEX "task_owner_id_idx" ON "task"("owner_id");

-- CreateIndex
CREATE INDEX "task_owner_id_scheduled_on_idx" ON "task"("owner_id", "scheduled_on");

-- CreateIndex
CREATE INDEX "task_theme_id_idx" ON "task"("theme_id");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
