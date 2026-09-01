import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — the app's PostgreSQL client for the `productivity` database, connecting as
 * the dedicated `productivity` Postgres role (never the superuser). Single-org, per-user app:
 * there is no RLS org-context binding here (contrast co-sy-v2's `withOrg`) — every query is
 * scoped to the authenticated caller's `ownerId` at the service layer instead (themes/tasks
 * services filter by `ownerId` explicitly on every read/write).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('Prisma');

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('connected to the productivity database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
