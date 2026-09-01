import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../common/date-only';

const DAYPARTS = ['morning', 'afternoon', 'evening', 'notes'] as const;

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  themeId?: string;

  /** 'YYYY-MM-DD' to schedule, or `null` to send the task back to its theme's backlog. */
  @IsOptional()
  @ValidateIf((o: UpdateTaskDto) => o.scheduledOn !== null)
  @Matches(DATE_ONLY_PATTERN, {
    message: 'scheduledOn must be YYYY-MM-DD or null.',
  })
  scheduledOn?: string | null;

  /** One of morning/afternoon/evening/notes, or `null` to clear it. */
  @IsOptional()
  @ValidateIf((o: UpdateTaskDto) => o.daypart !== null)
  @IsIn(DAYPARTS, { message: 'daypart must be morning, afternoon, evening, notes, or null.' })
  daypart?: (typeof DAYPARTS)[number] | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** true → sets doneAt (strikethrough); false → clears it. */
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
