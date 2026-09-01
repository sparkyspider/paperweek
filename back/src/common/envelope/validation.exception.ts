/**
 * Structured validation failure. Nest's default ValidationPipe collapses every
 * class-validator failure into a flat string[] — losing WHICH FIELD failed. We keep the
 * field so a form can put the message on the right input.
 */
import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { FieldError } from './envelope.types';

export function toFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  const out: FieldError[] = [];
  for (const err of errors) {
    const path = parentPath
      ? `${parentPath}.${err.property}`
      : String(err.property);
    for (const [code, message] of Object.entries(err.constraints ?? {})) {
      out.push({ field: path, message, code });
    }
    if (err.children?.length) {
      out.push(...toFieldErrors(err.children, path));
    }
  }
  return out;
}

/** Thrown by the global ValidationPipe; rendered by ExceptionEnvelopeFilter. */
export class ValidationFailedException extends BadRequestException {
  constructor(readonly fields: FieldError[]) {
    super('Please correct the highlighted fields.');
  }
}
