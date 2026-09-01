import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { SameOriginGuard } from './same-origin.guard';

/**
 * SecurityModule — `@Global` so features can `@UseGuards(RolesGuard | SameOriginGuard)`
 * without re-providing them. `JwtAuthGuard` is deliberately NOT here — it's the global
 * `APP_GUARD` registered in `app.module.ts`, and its `onModuleInit` reads
 * `ZitadelService.issuerUrl` (JWKS), so it must init after `ZitadelService`.
 */
@Global()
@Module({
  providers: [RolesGuard, SameOriginGuard],
  exports: [RolesGuard, SameOriginGuard],
})
export class SecurityModule {}
