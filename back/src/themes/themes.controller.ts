import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Theme } from '@prisma/client';
import { ThemesService } from './themes.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { ListThemesQueryDto } from './dto/list-themes-query.dto';
import { CurrentUser } from '../core/security/current-user.decorator';
import type { AuthUser } from '../core/security/jwt-auth.guard';

@ApiExcludeController()
@Controller('api/themes')
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListThemesQueryDto,
  ): Promise<Theme[]> {
    return this.themes.list(user.ownerId, query.includeArchived ?? false);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateThemeDto,
  ): Promise<Theme> {
    return this.themes.create(user.ownerId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateThemeDto,
  ): Promise<Theme> {
    return this.themes.update(user.ownerId, id, dto);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Theme> {
    return this.themes.archive(user.ownerId, id);
  }
}
