/**
 * Application bootstrap. The single place the global request pipeline is assembled:
 * security headers, CORS (SPA + refresh cookie), validation, the mandatory response
 * envelope + exception filter, and Swagger (dev only). Adapted from co-sy-v2's main.ts.
 */
import { config as loadDotenv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './common/envelope/response-envelope.interceptor';
import { ExceptionEnvelopeFilter } from './common/envelope/exception-envelope.filter';
import {
  ValidationFailedException,
  toFieldErrors,
} from './common/envelope/validation.exception';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { applyEnvelopeToDocument } from './common/envelope/openapi-envelope';
import { AppLogger } from './core/logging/app-logger.service';
import { requestIdMiddleware } from './core/logging/request-id.middleware';
import { securityHeadersMiddleware } from './common/security-headers/security-headers.middleware';
import { trustProxyHops } from './common/throttler/throttler.config';
import type { Express } from 'express';

import {
  assessBootConfig,
  formatMissingConfig,
} from './core/config/boot-config';
import { frontBaseUrl } from './core/config/front-base-url';

async function bootstrap() {
  // FAIL-LOUD BOOT VALIDATION: assess the config BEFORE any module is built, so a missing/
  // blank required key is one clear refusal naming every absent key — never a mid-DI throw.
  loadDotenv({ quiet: true });
  const boot = assessBootConfig(process.env, process.env.NODE_ENV);
  if (boot.missing.length > 0) {
    new Logger('BootConfig').error(formatMissingConfig(boot.missing));
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLogger));

  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
  (app.getHttpAdapter().getInstance() as Express).set(
    'trust proxy',
    trustProxyHops(),
  );

  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);

  const configService = app.get(ConfigService);
  const frontBase = frontBaseUrl(configService);

  app.enableCors({ origin: frontBase, credentials: true });
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ValidationFailedException(toFieldErrors(errors)),
    }),
  );

  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new ExceptionEnvelopeFilter());

  // Swagger — dev/test only, same posture as co-sy-v2 (never exposed in production).
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Productivity Tools API')
      .setDescription('back/ API — auth BFF + themes/tasks.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      applyEnvelopeToDocument(SwaggerModule.createDocument(app, swaggerConfig)),
    );
  }

  const port = configService.get<number>('PORT') ?? 3201;
  await app.listen(port);
  new Logger('Bootstrap').log(`listening on :${port}`);
}
void bootstrap();
