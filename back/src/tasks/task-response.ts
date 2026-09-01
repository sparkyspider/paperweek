import { Task } from '@prisma/client';
import { dbDateToString } from '../common/date-only';

/** The wire shape of a task — `scheduledOn` as a plain 'YYYY-MM-DD' string (no TZ math),
 *  never a Prisma `Date` object. */
export interface TaskResponse extends Omit<Task, 'scheduledOn'> {
  scheduledOn: string | null;
}

export function toTaskResponse(task: Task): TaskResponse {
  return {
    ...task,
    scheduledOn: task.scheduledOn ? dbDateToString(task.scheduledOn) : null,
  };
}
