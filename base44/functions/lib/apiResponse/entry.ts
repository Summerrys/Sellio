/**
 * Standardized API response formatter
 */

export function success(data, meta = {}) {
  return Response.json({
    success: true,
    data,
    meta,
  });
}

export function error(message, code = 'ERROR', status = 400) {
  return Response.json({
    success: false,
    error: {
      code,
      message,
    },
  }, { status });
}

export function unauthorized(message = 'Unauthorized') {
  return error(message, 'UNAUTHORIZED', 401);
}

export function forbidden(message = 'Forbidden') {
  return error(message, 'FORBIDDEN', 403);
}

export function notFound(message = 'Resource not found') {
  return error(message, 'NOT_FOUND', 404);
}

export function validationError(message = 'Validation failed', details = []) {
  return Response.json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details,
    },
  }, { status: 422 });
}

export function paginated(items, { limit, cursor, hasMore }) {
  return success(items, {
    pagination: {
      limit,
      cursor,
      hasMore,
      count: items.length,
    },
  });
}