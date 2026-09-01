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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { CurrentUser } from '../core/security/current-user.decorator';
import type { AuthUser } from '../core/security/jwt-auth.guard';
import { TaskResponse } from './task-response';

@ApiExcludeController()
@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTasksQueryDto,
  ): Promise<TaskResponse[]> {
    return this.tasks.list(user.ownerId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.create(user.ownerId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.update(user.ownerId, id, dto);
  }

  @Delete(':id')
  softDelete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<TaskResponse> {
    return this.tasks.softDelete(user.ownerId, id);
  }
}
