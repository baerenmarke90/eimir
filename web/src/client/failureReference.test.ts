import { afterEach, describe, expect, it } from 'vitest';
import {
  clearFailureReference,
  failureReferenceFor,
  recordRequestFailure,
} from './failureReference';
import { ClientProblemError } from './problemDetails';

afterEach(() => clearFailureReference());

describe('failureReferenceFor', () => {
  it('returns_the_recorded_failure_for_the_error_it_produced', () => {
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/plans',
      status: 500,
      code: 'INTERNAL_ERROR',
      requestId: 'req-1',
    });
    expect(
      failureReferenceFor(
        new ClientProblemError('server', 500, 'INTERNAL_ERROR'),
      ),
    ).toEqual({
      reference: 'GET:/api/v1/plans:500:INTERNAL_ERROR:web',
      requestId: 'req-1',
    });
    // An error without a problem code matches on the status alone.
    expect(
      failureReferenceFor(new ClientProblemError('server', 500))?.reference,
    ).toBe('GET:/api/v1/plans:500:INTERNAL_ERROR:web');
  });

  it('ignores_a_recorded_failure_with_another_status', () => {
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/plans',
      status: 503,
    });
    expect(
      failureReferenceFor(new ClientProblemError('server', 500)),
    ).toBeUndefined();
  });

  it('ignores_a_recorded_failure_with_another_code', () => {
    recordRequestFailure({
      method: 'PUT',
      routeTemplate: '/api/v1/plans/{id}',
      status: 409,
      code: 'VERSION_CONFLICT',
    });
    expect(
      failureReferenceFor(
        new ClientProblemError('conflict', 409, 'IDEMPOTENCY_KEY_REUSED'),
      ),
    ).toBeUndefined();
  });

  it('returns_nothing_without_a_recorded_failure', () => {
    expect(
      failureReferenceFor(new ClientProblemError('server', 500)),
    ).toBeUndefined();
  });

  it('returns_nothing_for_an_error_that_is_not_a_client_problem', () => {
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/plans',
      status: 500,
    });
    expect(failureReferenceFor(new Error('render failed'))).toBeUndefined();
    expect(failureReferenceFor(undefined)).toBeUndefined();
  });

  it('matches_a_status_less_error_only_to_a_transport_failure', () => {
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/plans',
      status: 0,
      outcome: 'network',
    });
    expect(
      failureReferenceFor(new ClientProblemError('unknown'))?.reference,
    ).toBe('GET:/api/v1/plans:network:web');

    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/plans',
      status: 500,
    });
    expect(
      failureReferenceFor(new ClientProblemError('unknown')),
    ).toBeUndefined();
  });
});
