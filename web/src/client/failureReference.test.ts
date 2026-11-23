import { afterEach, describe, expect, it } from 'vitest';
import {
  clearFailureReference,
  failureReferenceFor,
  formatFailureForDisplay,
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

describe('formatFailureForDisplay', () => {
  it('shows_method_status_and_surface_without_the_route', () => {
    expect(formatFailureForDisplay('GET:/api/v1/plans/{id}:500:web')).toBe(
      'GET · 500 · web',
    );
  });

  it('includes_the_problem_code_when_present', () => {
    expect(
      formatFailureForDisplay(
        'GET:/api/v1/spaces/{id}/notifications:500:E2E_UNAVAILABLE:web',
      ),
    ).toBe('GET · 500 · E2E_UNAVAILABLE · web');
  });

  it('shows_the_transport_outcome_when_no_response_arrived', () => {
    expect(formatFailureForDisplay('PUT:/memories/{id}:network:app')).toBe(
      'PUT · network · app',
    );
    expect(formatFailureForDisplay('POST:/api/v1/plans:timeout:web')).toBe(
      'POST · timeout · web',
    );
  });

  it('hides_an_api_base_under_a_sub_path', () => {
    const shown = formatFailureForDisplay(
      'DELETE:/eimir/api/v1/spaces/{id}/plans/{id}:404:RESOURCE_NOT_FOUND:web',
    );
    expect(shown).toBe('DELETE · 404 · RESOURCE_NOT_FOUND · web');
    expect(shown).not.toContain('/');
  });

  it('formats_a_recorded_failure_reference', () => {
    recordRequestFailure({
      method: 'patch',
      routeTemplate: '/api/v1/memories/123?draft=1',
      status: 409,
      code: 'CONFLICT',
    });
    const reference = failureReferenceFor(
      new ClientProblemError('conflict', 409, 'CONFLICT'),
    )?.reference;
    expect(reference && formatFailureForDisplay(reference)).toBe(
      'PATCH · 409 · CONFLICT · web',
    );
  });

  it('falls_back_to_a_short_neutral_form_without_path_segments', () => {
    expect(formatFailureForDisplay('not-a-reference')).toBe('not-a-reference');
    expect(formatFailureForDisplay('GET:/api/v1/plans:500:desktop')).toBe(
      'GET::500:desktop',
    );
    expect(
      formatFailureForDisplay('something:/a/b/c:with:too:many:parts:web'),
    ).toBe('something::with:too:many');
    expect(formatFailureForDisplay('/only/a/path')).toBe('–');
    for (const shown of [
      formatFailureForDisplay('get:/api/v1/plans:500:web'),
      formatFailureForDisplay('GET:/api/v1/plans:5 0:web'),
    ])
      expect(shown).not.toContain('/');
  });
});
