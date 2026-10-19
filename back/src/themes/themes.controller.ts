import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { Theme } from '@prisma/client';
import { ThemesService } from './themes.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { ListThemesQueryDto } from './dto/list-themes-query.dto';
import { ReorderThemesDto } from './dto/reorder-themes.dto';
import { HardDeletedThemeDto } from './dto/hard-deleted-theme.dto';
import {
  CurrentSatelliteUser,
  RequireRole,
} from '@co-sy/satellite-guard/nest';
import type { SatelliteUser } from '@co-sy/satellite-guard';
import {
  PAPERWEEK_DELETE_ROLE,
  PAPERWEEK_ROLE,
} from '../core/security/satellite-auth.config';

@ApiExcludeController()
@RequireRole(PAPERWEEK_ROLE)
@Controller('api/themes')
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  list(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Query() query: ListThemesQueryDto,
  ): Promise<Theme[]> {
    return this.themes.list(me.sub, query.includeArchived ?? false);
  }

  @Post()
  create(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Body() dto: CreateThemeDto,
  ): Promise<Theme> {
    return this.themes.create(me.sub, dto);
  }

  // Declared before the `:id` routes (and on a distinct verb, PUT, so it can never be shadowed
  // by `PATCH :id` matching the literal segment "order" as an id) — sidebar drag-to-reorder
  // writes through this in one transaction rather than N individual `PATCH :id {position}` calls.
  @Put('order')
  reorder(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Body() dto: ReorderThemesDto,
  ): Promise<Theme[]> {
    return this.themes.reorder(me.sub, dto.ids);
  }

  @Patch(':id')
  update(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Param('id') id: string,
    @Body() dto: UpdateThemeDto,
  ): Promise<Theme> {
    return this.themes.update(me.sub, id, dto);
  }

  @Delete(':id')
  archive(@CurrentSatelliteUser() me: SatelliteUser, @Param('id') id: string): Promise<Theme> {
    return this.themes.archive(me.sub, id);
  }

  /**
   * Hard delete one of the caller's own themes and its tasks (084-Q8). Needs BOTH roles: the
   * controller's PAPERWEEK_USER and this route's PAPERWEEK_DELETE, both from the verified token.
   * No PAPERWEEK_DELETE right → 403 ROLE_REQUIRED. Not the caller's theme → 404, nothing deleted.
   */
  @ApiOperation({
    summary: "Hard delete one of the caller's own themes, with its tasks (PAPERWEEK_DELETE right, granted to agent accounts)",
  })
  @RequireRole(PAPERWEEK_DELETE_ROLE)
  @Delete(':id/hard')
  hardDelete(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Param('id') id: string,
  ): Promise<HardDeletedThemeDto> {
    return this.themes.hardDelete(me.sub, id);
  }
}
