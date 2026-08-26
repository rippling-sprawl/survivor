/**
 * An error caused by what the caller asked for, not by something breaking.
 *
 * The distinction matters at the API boundary: an internal failure should return a generic message
 * (Supabase error text names tables and columns, which is not for a browser), but a validation
 * failure is exactly the thing the admin needs to read. "Duplicate castaway names: joe" is
 * actionable; "Something went wrong" sends them to the server logs for no reason.
 */
export class ValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

/** Thrown when the caller asked for something that isn't there. */
export class NotFoundError extends ValidationError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/** Thrown when the request is valid but conflicts with current state. */
export class ConflictError extends ValidationError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}
