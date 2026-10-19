/**
 * What `DELETE /api/themes/:id/hard` answers (084-Q8): the theme that is gone and how many of its
 * tasks went with it. Identifiers and a count only, never the theme's or its tasks' wording.
 */
export class HardDeletedThemeDto {
  /** The deleted theme's id. The row no longer exists. */
  id!: string;

  /** How many of the caller's own tasks under that theme were deleted with it. */
  tasksDeleted!: number;
}
