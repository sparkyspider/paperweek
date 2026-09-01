/**
 * Safe diagnostics. An exception message can carry arbitrary payload data (e.g. Prisma's
 * `PrismaClientValidationError.message` renders the entire call-arguments object). This
 * reduces any thrown error to `Name[code]: first line…` before it ever reaches a logger, so a
 * task's title/notes text can never leak into a 500 log line. Adapted verbatim from co-sy-v2.
 */

const MAX_FIRST_LINE = 200;

function codeOf(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code.length <= 32 ? code : undefined;
}

export function safeErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) {
    const raw = String(err);
    return raw.length > MAX_FIRST_LINE
      ? `${raw.slice(0, MAX_FIRST_LINE)}… (+${raw.length - MAX_FIRST_LINE} characters elided)`
      : raw;
  }

  const message = err.message ?? '';
  const newline = message.indexOf('\n');
  const head = newline === -1 ? message : message.slice(0, newline);
  const kept = head.slice(0, MAX_FIRST_LINE);
  const elided = message.length - kept.length;

  const code = codeOf(err);
  const label = code ? `${err.name}[${code}]` : err.name;
  const suffix = elided > 0 ? `… (+${elided} characters elided)` : '';
  return `${label}: ${kept}${suffix}`;
}

/** The stack's FRAMES only — `Error.stack` opens with `${name}: ${message}`, which would
 *  re-leak everything `safeErrorDetail` just removed. */
export function safeErrorStack(err: unknown): string | undefined {
  if (!(err instanceof Error) || typeof err.stack !== 'string')
    return undefined;
  const frames = err.stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line))
    .join('\n');
  return frames.length > 0 ? frames : undefined;
}
