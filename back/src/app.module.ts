/**
 * Root module. Wires the cross-cutting modules (config, Prisma, Zitadel) and every feature
 * module, plus the two global guards:
 *
 *   1. `ThrottlerTrackerGuard` — rate limiting, registered FIRST so floods are rejected
 *      before any auth/JWKS work.
 *   2. `JwtAuthGuard` — deny-by-default: every route needs a valid JWT unless `@Public()`.
 *
 * Single-org app: no acting-org header, no org-drift reconciliation, no invitations module
 * (co-sy-v2's multi-tenant machinery is deliberately stripped — see AGENTS.md / README.md).
 */
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ThemesModule } from './themes/themes.module';
import { TasksModule } from './tasks/tasks.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { ZitadelModule } from './core/zitadel/zitadel.module';
import { SecurityModule } from './core/security/security.module';
import { JwtAuthGuard } from './core/security/jwt-auth.guard';
import { ThrottlerTrackerGuard } from './common/throttler/throttler-tracker.guard';
import { THROTTLERS } from './common/throttler/throttler.config';
import { LoggingModule } from './core/logging/logging.module';
import { HttpLoggingInterceptor } from './core/logging/http-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    ThrottlerModule.forRoot(THROTTLERS),
    PrismaModule,
    ZitadelModule, // JwtAuthGuard (global) needs ZitadelService (JWKS) resolvable here
    SecurityModule,
    AuthModule,
    ThemesModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerTrackerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
