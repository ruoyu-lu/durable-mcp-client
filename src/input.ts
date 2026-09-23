import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { assertJsonValue } from './json.js';
import { AdapterError } from './errors.js';
import type { Snapshot } from './types.js';

/** Local checks run before reserving a key or sending input to the server. */
export function validateInputResponse(request: NonNullable<Snapshot['inputRequests']>[string], response: Record<string, unknown>): void {
  assertJsonValue(response, 'Input response');
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Input response must be an object');
  if (request.method !== 'elicitation/create' || (request.params?.mode ?? 'form') !== 'form') return;
  const invalid = (message: string): never => { throw new AdapterError({ kind: 'validation', message }); };
  if (typeof response.action !== 'string' || !['accept', 'decline', 'cancel'].includes(response.action)) invalid('Form response action must be accept, decline or cancel');
  if (response.action !== 'accept') return;
  const content = response.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) invalid('Accepted form response requires object content');
  for (const value of Object.values(content as Record<string, unknown>)) {
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)
      && !(Array.isArray(value) && value.every(item => typeof item === 'string'))) {
      invalid('Form content supports primitives and arrays of strings only');
    }
  }
  const schema = request.params?.requestedSchema;
  if (schema === undefined) return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) invalid('Unsupported form schema');
  // Compile synchronously: no remote schema loading, coercion or inserted defaults.
  const draft = (schema as Record<string, unknown>).$schema;
  const options = { strictTypes: false, strictTuples: false, ownProperties: true, formats: fullFormats };
  const ajv = draft === 'http://json-schema.org/draft-07/schema#' ? new Ajv(options) : new Ajv2020(options);
  ajv.addKeyword({ keyword: 'enumNames', schemaType: 'array', valid: true });
  try {
    const validate = ajv.compile(schema as Record<string, unknown>);
    if ('$async' in validate && validate.$async) invalid('Asynchronous form schemas are unsupported');
    if (!validate(content)) invalid(`Invalid form content: ${ajv.errorsText(validate.errors)}`);
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    invalid(`Unsupported form schema: ${error instanceof Error ? error.message : String(error)}`);
  }
}
