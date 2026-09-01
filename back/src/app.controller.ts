/** Root controller — liveness/health probes. Both public: a health check must answer with
 *  no token. */
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './core/security/public.decorator';

@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.livenessMessage();
  }

  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
