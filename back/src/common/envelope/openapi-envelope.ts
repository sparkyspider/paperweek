/**
 * Makes the OpenAPI document tell the truth about the response envelope: every response is
 * wrapped in `{ data, meta, error }` at runtime, but the swagger plugin reads a controller's
 * declared return type and cannot see interceptors — so without this the document describes
 * the unwrapped value.
 */
import type { OpenAPIObject } from '@nestjs/swagger';

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
] as const;

export type ReferenceObject = { $ref: string };
export type SchemaObject = {
  type?: string;
  nullable?: boolean;
  description?: string;
  enum?: unknown[];
  required?: string[];
  items?: SchemaObject | ReferenceObject;
  allOf?: (SchemaObject | ReferenceObject)[];
  properties?: Record<string, SchemaObject | ReferenceObject>;
};
export type ResponseObject = {
  description?: string;
  content?: Record<string, { schema?: SchemaObject | ReferenceObject }>;
};
export type OperationObject = { responses?: Record<string, ResponseObject> };
type PathItemObject = Partial<
  Record<(typeof HTTP_METHODS)[number], OperationObject>
>;

const JSON_MIME = 'application/json';

const ENVELOPE_SCHEMAS: Record<string, SchemaObject> = {
  EnvelopeMeta: {
    type: 'object',
    required: ['status', 'code', 'requestId'],
    properties: {
      status: { type: 'string', enum: ['ok', 'error'] },
      code: { type: 'number', description: 'Numeric HTTP status.' },
      requestId: { type: 'string' },
      messages: { type: 'array', items: { type: 'string' } },
    },
  },
  FieldError: {
    type: 'object',
    required: ['field', 'message'],
    properties: {
      field: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
  EnvelopeError: {
    type: 'object',
    required: ['code', 'message'],
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      fields: { type: 'array', items: ref('FieldError') },
    },
  },
};

const ERROR_RESPONSES: Record<string, { description: string }> = {
  '400': { description: 'Validation failed — `error.fields[]` marks the offending inputs.' },
  '401': { description: 'Missing or invalid token.' },
  '500': { description: 'Unexpected server error. Quote `meta.requestId` when reporting it.' },
};

function ref(name: string): ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

function envelopeOf(data: SchemaObject | ReferenceObject | undefined): SchemaObject {
  return {
    type: 'object',
    required: ['data', 'meta', 'error'],
    properties: {
      data: data ?? { nullable: true },
      meta: ref('EnvelopeMeta'),
      error: { allOf: [ref('EnvelopeError')], nullable: true },
    },
  };
}

function errorEnvelope(): SchemaObject {
  return {
    type: 'object',
    required: ['data', 'meta', 'error'],
    properties: {
      data: { nullable: true, description: 'Always null on error.' },
      meta: ref('EnvelopeMeta'),
      error: ref('EnvelopeError'),
    },
  };
}

export function applyEnvelopeToDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas = {
    ...ENVELOPE_SCHEMAS,
    ...(document.components.schemas ?? {}),
  };

  const paths = (document.paths ?? {}) as Record<string, PathItemObject>;
  for (const pathItem of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation?.responses) continue;

      for (const [status, response] of Object.entries(operation.responses)) {
        if (!status.startsWith('2')) continue;
        const res = response;
        const existing = res.content?.[JSON_MIME]?.schema;
        res.content = {
          ...res.content,
          [JSON_MIME]: { schema: envelopeOf(existing) },
        };
      }

      for (const [status, { description }] of Object.entries(ERROR_RESPONSES)) {
        operation.responses[status] ??= {
          description,
          content: { [JSON_MIME]: { schema: errorEnvelope() } },
        };
      }
    }
  }

  return document;
}
