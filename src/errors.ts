import { assertJsonValue } from './json.js';

export interface FailureDetails {
  kind: 'http' | 'protocol' | 'transport' | 'invalid_response' | 'validation' | 'adapter';
  message: string;
  method?: string;
  status?: number;
  code?: number;
  data?: unknown;
}

export class AdapterError extends Error {
  constructor(readonly details: FailureDetails, options?: ErrorOptions) {
    super(details.message, options);
    assertJsonValue(details, 'Adapter error details');
    this.name = 'AdapterError';
  }
}

/** Only an adapter with proof of non-acceptance may enable explicit correction. */
export class InputRejectedError extends AdapterError {
  constructor(details: FailureDetails, readonly evidence: string) {
    super(details);
    if (!evidence.trim()) throw new Error('Input rejection requires non-acceptance evidence');
    this.name = 'InputRejectedError';
  }
}

export function failureDetails(error: unknown): FailureDetails {
  return error instanceof AdapterError ? error.details
    : { kind: 'adapter', message: error instanceof Error ? error.message : String(error) };
}
