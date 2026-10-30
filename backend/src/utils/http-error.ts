/**
 * Error carrying an HTTP status code. Messages of 4xx errors are safe to show
 * to clients; 5xx messages are never sent to clients by the error handler.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export const badRequest = (message: string): HttpError => new HttpError(message, 400);
export const unauthorized = (message: string): HttpError => new HttpError(message, 401);
export const forbidden = (message: string): HttpError => new HttpError(message, 403);
export const notFound = (message: string): HttpError => new HttpError(message, 404);
