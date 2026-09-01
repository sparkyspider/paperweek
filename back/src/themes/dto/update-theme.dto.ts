import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateThemeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsHexColor({ message: 'color must be a hex colour, e.g. #AFCBE3.' })
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** true → archive (sets archivedAt); false → unarchive (clears it). */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
