import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../common/date-only';

const toBool = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** GET /api/tasks — two mutually exclusive shapes:
 *    ?from=YYYY-MM-DD&to=YYYY-MM-DD          → scheduled tasks in range
 *    ?themeId=<uuid>&backlog=true            → a theme's unscheduled backlog */
export class ListTasksQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'from must be YYYY-MM-DD.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'to must be YYYY-MM-DD.' })
  to?: string;

  @IsOptional()
  @IsUUID()
  themeId?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  backlog?: boolean;
}
