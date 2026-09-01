import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  livenessMessage(): string {
    return 'productivity-tools back — ok';
  }
}
