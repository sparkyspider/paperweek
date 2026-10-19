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
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import {
  CurrentSatelliteUser,
  RequireRole,
} from '@co-sy/satellite-guard/nest';
import type { SatelliteUser } from '@co-sy/satellite-guard';
import {
  PAPERWEEK_DELETE_ROLE,
  PAPERWEEK_ROLE,
} from '../core/security/satellite-auth.config';
import { TaskResponse } from './task-response';
import { HardDeletedTaskDto } from './dto/hard-deleted-task.dto';

@ApiExcludeController()
@RequireRole(PAPERWEEK_ROLE)
@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Query() query: ListTasksQueryDto,
  ): Promise<TaskResponse[]> {
    return this.tasks.list(me.sub, query);
  }

  @Post()
  create(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.create(me.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.update(me.sub, id, dto);
  }

  /**
   * Hard delete one of the caller's own tasks (084-Q8). Needs BOTH roles: the controller's
   * PAPERWEEK_USER and this route's PAPERWEEK_DELETE, both from the verified token. No PAPERWEEK_DELETE right
   * → 403 ROLE_REQUIRED. Not the caller's task → 404, nothing deleted. Declared before
   * `DELETE :id` for reading order only; the two paths never overlap.
   */
  @ApiOperation({ summary: "Hard delete one of the caller's own tasks (PAPERWEEK_DELETE right, granted to agent accounts)" })
  @RequireRole(PAPERWEEK_DELETE_ROLE)
  @Delete(':id/hard')
  hardDelete(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Param('id') id: string,
  ): Promise<HardDeletedTaskDto> {
    return this.tasks.hardDelete(me.sub, id);
  }

  @Delete(':id')
  softDelete(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Param('id') id: string,
  ): Promise<TaskResponse> {
    return this.tasks.softDelete(me.sub, id);
  }

  /** Undo for `DELETE /api/tasks/:id` — Cmd+Z in the front end (D-front-038). Reaches a
   *  soft-deleted row (ordinary routes never see one) so an in-time undo works even after the
   *  deferred client-side DELETE has already fired. */
  @Post(':id/restore')
  restore(
    @CurrentSatelliteUser() me: SatelliteUser,
    @Param('id') id: string,
  ): Promise<TaskResponse> {
    return this.tasks.restore(me.sub, id);
  }
}
