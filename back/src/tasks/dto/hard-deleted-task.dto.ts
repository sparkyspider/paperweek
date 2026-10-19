/**
 * What `DELETE /api/tasks/:id/hard` answers (084-Q8): the id of the task that is gone. The row no
 * longer exists, so there is nothing else to return.
 */
export class HardDeletedTaskDto {
  /** The deleted task's id. */
  id!: string;
}
