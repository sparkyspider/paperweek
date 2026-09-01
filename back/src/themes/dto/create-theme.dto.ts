import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateThemeDto {
  @IsString()
  @MinLength(1, { message: 'Name is required.' })
  @MaxLength(80)
  name!: string;

  /** Hex colour, e.g. `#AFCBE3`. Optional — the service picks a default if omitted. */
  @IsOptional()
  @IsHexColor({ message: 'color must be a hex colour, e.g. #AFCBE3.' })
  color?: string;
}
