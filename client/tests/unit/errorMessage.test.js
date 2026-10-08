// What users see when an api.* call rejects: the server's own text for 4xx (validation, duplicate, forbidden),
// a friendly fallback for network failures, gateway pages and server errors.
import { test, expect } from 'vitest';
import { errorMessage } from '../../src/services/errorMessage.js';

const apiError = (status, body, message = `Request failed (HTTP ${status}).`) => Object.assign(new Error(message), { name: 'ApiError', status, body });

test('400 validation message from the server is shown as is', () => {
  expect(errorMessage(apiError(400, { error: 'End date cannot be before start date.' }, 'End date cannot be before start date.'), 'Could not save.')).toBe('End date cannot be before start date.');
});
test('409 duplicate-entry message from the server is shown', () => {
  expect(errorMessage(apiError(409, { error: 'A request already exists for this school.' }), 'Could not send request.')).toBe('A request already exists for this school.');
});
test('403 school-access message is shown', () => {
  expect(errorMessage(apiError(403, { error: 'You do not have access to this school.' }), 'x')).toBe('You do not have access to this school.');
});
test('4xx without a JSON body still uses the error message instead of the fallback', () => {
  expect(errorMessage(apiError(404, null, 'Request failed (HTTP 404).'), 'fallback')).toBe('Request failed (HTTP 404).');
});
test('network failure, gateway page and 500 use the friendly fallback', () => {
  expect(errorMessage(new TypeError('Failed to fetch'), 'Unable to connect.')).toBe('Unable to connect.');
  expect(errorMessage(apiError(504, null, 'The server is busy or timed out (HTTP 504). Please try again shortly.'), 'Unable to connect.')).toBe('Unable to connect.');
  expect(errorMessage(apiError(500, { error: 'duplicate key value violates unique constraint "pk"' }), 'Could not save.')).toBe('Could not save.'); // internals are not shown to users
  expect(errorMessage(undefined, 'Could not save.')).toBe('Could not save.');
});
