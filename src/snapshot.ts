import { assertJsonValue } from './json.js';
import { validPollInterval } from './types.js';
import type { Snapshot } from './types.js';

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

/** Validate normalized adapter state before it can replace a saved observation. */
export function assertSnapshot(value: unknown): asserts value is Snapshot {
  // Check data properties first; validation must not invoke payload getters.
  assertJsonValue(value, 'Task snapshot');
  assertObject(value, 'Task snapshot');
  if (!Object.hasOwn(value, 'status') || typeof value.status !== 'string'
    || !['working', 'input_required', 'completed', 'failed', 'cancelled'].includes(value.status)) {
    throw new Error('Task snapshot has an unsupported status');
  }
  if (value.status === 'completed' && !Object.hasOwn(value, 'result')) {
    throw new Error('Completed task snapshot requires a result');
  }
  if ((value.status === 'failed' || Object.hasOwn(value, 'error')) && typeof value.error !== 'string') {
    throw new Error('Task snapshot error must be a string');
  }
  if (Object.hasOwn(value, 'pollIntervalMs') && !validPollInterval(value.pollIntervalMs)) {
    throw new Error('Task snapshot pollIntervalMs must be a non-negative safe integer');
  }
  if (value.status === 'input_required' || Object.hasOwn(value, 'inputRequests')) {
    assertObject(value.inputRequests, 'Task snapshot inputRequests');
    for (const request of Object.values(value.inputRequests)) {
      assertObject(request, 'Task snapshot input request');
      if (typeof request.method !== 'string' || !request.method.trim()) {
        throw new Error('Task snapshot input request requires a method');
      }
      if (Object.hasOwn(request, 'params')) assertObject(request.params, 'Task snapshot input request params');
    }
  }
}
