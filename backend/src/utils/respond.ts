import { Response } from "express";

/**
 * Send an error response without leaking internal details. Errors carrying an
 * explicit 4xx status keep their (user-facing) message; anything else is
 * logged server-side and replaced with a generic message.
 */
export const sendError = (
  res: Response,
  error: any,
  fallback = "Internal server error"
): void => {
  const statusCode = Number(error?.statusCode || error?.status) || 500;
  if (statusCode >= 500) {
    console.error(fallback, error);
  }
  res.status(statusCode).json({
    message: statusCode >= 500 ? fallback : error?.message || fallback,
  });
};

const INTERNAL_ERROR_PATTERNS = [/prisma/i, /database/i, /ECONNREFUSED/i, /SQL/i];

/**
 * Send a 400 response for validation errors, but replace messages that look
 * like database/internal failures with a generic message.
 */
export const sendBadRequest = (
  res: Response,
  error: any,
  fallback = "Permintaan tidak valid"
): void => {
  const message = typeof error?.message === "string" ? error.message : "";
  const isInternal =
    (typeof error?.code === "string" && error.code.startsWith("P")) ||
    INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));

  if (isInternal) {
    console.error(fallback, error);
  }

  res.status(400).json({ message: isInternal || !message ? fallback : message });
};
