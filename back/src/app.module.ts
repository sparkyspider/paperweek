/**
 * Root module. Wires the cross-cutting modules (config, Prisma, logging) and every feature
 * module, plus the two global guards, in this order:
 *
 *   1. `ThrottlerTrackerGuard` — rate limiting, registered FIRST so floods are rejected
 *      before any token or key work.
 *   2. `SatelliteAuthGuard` (`@co-sy/satellite-guard`) — deny-by-default: every route needs a
 *      valid Co-Sy satellite token unless it carries `@SatellitePublic()`. Feature controllers
 *      add `@RequireRole(PAPERWEEK_ROLE)`, read only from the verified token.
 *
 * Paperweek is a Co-Sy satellite (co-sy-v2 task 084): people sign in on Co-Sy's page, and this
 * API holds no login broker, no refresh cookie and no Zitadel credential of its own.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  SatelliteAuthGuard,
  SatelliteGuardModule,
} from '@co-sy/satellite-guard/nest';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThemesModule } from './themes/themes.module';
import { TasksModule } from './tasks/tasks.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { ThrottlerTrackerGuard } from './common/throttler/throttler-tracker.guard';
import { THROTTLERS } from './common/throttler/throttler.config';
import { LoggingModule } from './core/logging/logging.module';
import { HttpLoggingInterceptor } from './core/logging/http-logging.interceptor';
import { satelliteAuthConfig } from './core/security/satellite-auth.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    ThrottlerModule.forRoot(THROTTLERS),
    PrismaModule,
    // globalGuard: false — registered below, AFTER the throttler, so the order is explicit.
    SatelliteGuardModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => satelliteAuthConfig(config),
      globalGuard: false,
    }),
    ThemesModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerTrackerGuard },
    { provide: APP_GUARD, useExisting: SatelliteAuthGuard },
  ],
})
export class AppModule {}
