/**
 * The app's logger — a pino-backed `LoggerService`, adapted from co-sy-v2's `CosyLogger`.
 *
 * Each Nest `Logger` context (e.g. `new Logger('Auth')`) gets its own pino child logger whose
 * level is resolved per area from the environment (`LOG_LEVEL_<CONTEXT>`, else `LOG_LEVEL`,
 * else the default). Every line carries the request's `requestId`. Secrets are redacted by
 * construction — see {@link REDACTED_PATHS}, and note pino's `redact` only reaches OBJECT
 * bindings, never an already-interpolated message string.
 */
import { Injectable, Optional, type LoggerService } from '@nestjs/common';
import {
  pino,
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions,
} from 'pino';
import { requestContext } from './request-context';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const SECRET_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'apiKey',
  'secret',
];

const redactPaths = (keys: readonly string[]): string[] => [
  ...keys,
  ...keys.map((k) => `*.${k}`),
];

export const REDACTED_PATHS: readonly string[] = [
  ...redactPaths(SECRET_KEYS),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const VALID: readonly PinoLevel[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

@Injectable()
export class AppLogger implements LoggerService {
  private readonly root: PinoLogger;
  private readonly children = new Map<string, PinoLogger>();
  private readonly defaultLevel: PinoLevel;
  private readonly defaultContext = 'App';

  constructor(@Optional() destination?: DestinationStream) {
    const isProd = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';
    this.defaultLevel = isProd ? 'info' : 'debug';

    const options: LoggerOptions = {
      level: 'trace',
      redact: { paths: [...REDACTED_PATHS], censor: '[REDACTED]' },
    };

    if (!isProd && !isTest) {
      options.transport = {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      };
      this.root = pino(options);
    } else {
      this.root = pino(options, destination as DestinationStream);
    }
  }

  private resolveLevel(context: string): PinoLevel {
    const key =
      'LOG_LEVEL_' + context.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const raw = process.env[key] ?? process.env.LOG_LEVEL ?? this.defaultLevel;
    const level = raw.toLowerCase() as PinoLevel;
    return VALID.includes(level) ? level : this.defaultLevel;
  }

  private childFor(context: string): PinoLogger {
    let child = this.children.get(context);
    if (!child) {
      child = this.root.child({ context });
      child.level = this.resolveLevel(context);
      this.children.set(context, child);
    }
    return child;
  }

  private write(level: PinoLevel, message: unknown, params: unknown[]): void {
    const extras = [...params];
    const context =
      extras.length && typeof extras[extras.length - 1] === 'string'
        ? (extras.pop() as string)
        : this.defaultContext;

    const child = this.childFor(context);
    const bindings: Record<string, unknown> = {};
    const requestId = requestContext.getStore()?.requestId;
    if (requestId) bindings.requestId = requestId;
    if (extras.length)
      bindings.detail = extras.length === 1 ? extras[0] : extras;

    if (typeof message === 'object' && message !== null) {
      child[level]({ ...bindings, ...message });
    } else {
      child[level](bindings, String(message));
    }
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }
}
