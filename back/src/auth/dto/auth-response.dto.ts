import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A completed login: the short-lived access JWT for the SPA (refresh rides an httpOnly
 *  cookie). */
export class AccessTokenResponseDto {
  @ApiProperty({ description: 'Short-lived access JWT (in-memory in the SPA).' })
  accessToken!: string;

  @ApiProperty({ description: 'Access-token lifetime in seconds.' })
  expiresIn!: number;
}

export class LogoutResponseDto {
  @ApiProperty({ enum: [true] })
  ok!: true;
}

/** GET /auth/me — the caller's lean profile. */
export class MeResponseDto {
  @ApiProperty({ description: 'Zitadel user id (JWT sub) — also the DB ownerId.' })
  sub!: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty()
  isAgent!: boolean;
}
