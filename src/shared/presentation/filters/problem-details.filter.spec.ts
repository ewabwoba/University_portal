import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../../domain/domain-error.js';
import { RequestValidationException } from '../http/request-validation.exception.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

function run(exception: unknown) {
  const json = vi.fn();
  const type = vi.fn(() => ({ json }));
  const status = vi.fn(() => ({ type }));
  const req = { id: 'req-123', path: '/api/v1/things' };
  const res = { headersSent: false, status };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter().catch(exception, host);
  return { status, type, body: json.mock.calls[0][0] };
}

describe('ProblemDetailsFilter', () => {
  it('maps domain errors by kind and exposes code, details and correlation id', () => {
    const { status, type, body } = run(
      new BusinessRuleViolationError('Fee clearance not met.', {
        code: 'FEE_CLEARANCE_NOT_MET',
        details: { required: 60 },
      }),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(body).toMatchObject({
      status: 422,
      title: 'Unprocessable Entity',
      detail: 'Fee clearance not met.',
      code: 'FEE_CLEARANCE_NOT_MET',
      details: { required: 60 },
      correlationId: 'req-123',
      instance: '/api/v1/things',
    });
  });

  it.each([
    [new NotFoundError('x'), 404, 'NOT_FOUND'],
    [new ConflictError('x'), 409, 'CONFLICT'],
  ])(
    'uses the kind as default code (%#)',
    (error, expectedStatus, expectedCode) => {
      const { body } = run(error);
      expect(body.status).toBe(expectedStatus);
      expect(body.code).toBe(expectedCode);
    },
  );

  it('returns field-level errors for request validation failures', () => {
    const { body } = run(
      new RequestValidationException([
        { field: 'email', messages: ['email must be an email'] },
      ]),
    );

    expect(body.status).toBe(422);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors).toEqual([
      { field: 'email', messages: ['email must be an email'] },
    ]);
  });

  it('normalises framework HttpExceptions', () => {
    expect(run(new NotFoundException('nope')).body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'nope',
    });
    expect(run(new BadRequestException(['a', 'b'])).body).toMatchObject({
      status: 400,
      detail: 'a; b',
    });
  });

  it('hides internals of unexpected errors', () => {
    const { status, body } = run(
      new Error('connection string postgres://admin:hunter2@db'),
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.details).toBeUndefined();
  });
});
