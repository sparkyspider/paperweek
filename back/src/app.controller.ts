/** Root controller — liveness/health probes. Both public: a health check must answer with
 *  no token. */
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppService } from './app.service';
import { SatellitePublic } from '@co-sy/satellite-guard/nest';

@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @SatellitePublic()
  @Get()
  getHello(): string {
    return this.appService.livenessMessage();
  }

  @SatellitePublic()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
