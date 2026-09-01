import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service';

/** Global logging module. Provides the pino-backed `AppLogger` so it is resolvable in
 *  `main.ts` (`app.useLogger`) and injectable anywhere. */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggingModule {}
