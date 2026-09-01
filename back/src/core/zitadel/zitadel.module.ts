import { Global, Module } from '@nestjs/common';
import { ZitadelService } from './zitadel.service';

@Global()
@Module({
  providers: [ZitadelService],
  exports: [ZitadelService],
})
export class ZitadelModule {}
