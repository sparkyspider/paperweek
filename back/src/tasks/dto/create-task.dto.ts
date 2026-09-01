import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** POST /api/tasks — always creates a backlog task (scheduledOn/daypart null); scheduling
 *  happens via PATCH once the task is dragged into the week. */
export class CreateTaskDto {
  @IsUUID()
  themeId!: string;

  @IsString()
  @MinLength(1, { message: 'Title is required.' })
  @MaxLength(280)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
