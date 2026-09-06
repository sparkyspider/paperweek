import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Body for `PUT /api/themes/order` — the caller's complete, ordered set of active (non-archived)
 *  theme ids, front to back. The service rejects anything short of an exact match against the
 *  caller's current active set (missing an id, an id belonging to someone else, or a duplicate). */
export class ReorderThemesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}
