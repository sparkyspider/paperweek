import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trimEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** POST /auth/login — local email + password login via a Zitadel session. */
export class LocalLoginDto {
  @Transform(trimEmail)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(200)
  email!: string;

  @IsString()
  password!: string;
}
