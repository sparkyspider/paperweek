import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

const toBool = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListThemesQueryDto {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeArchived?: boolean;
}
