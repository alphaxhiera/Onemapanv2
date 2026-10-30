import { HttpError } from "./http-error";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt only uses the first 72 bytes

/**
 * Enforces the password policy on the server. The frontend check alone is not
 * sufficient because API calls can bypass the UI.
 */
export const assertStrongPassword = (password: string): void => {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(
      `Password minimal ${PASSWORD_MIN_LENGTH} karakter`,
      400
    );
  }

  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new HttpError("Password maksimal 72 byte", 400);
  }

  if (!/[a-z]/.test(password)) {
    throw new HttpError("Password harus mengandung huruf kecil", 400);
  }
  if (!/[A-Z]/.test(password)) {
    throw new HttpError("Password harus mengandung huruf besar", 400);
  }
  if (!/\d/.test(password)) {
    throw new HttpError("Password harus mengandung angka", 400);
  }
  if (!/[\W_]/.test(password)) {
    throw new HttpError("Password harus mengandung karakter khusus", 400);
  }
};

export const assertValidUsername = (username: unknown): string => {
  if (typeof username !== "string") {
    throw new HttpError("Username wajib diisi", 400);
  }

  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 150) {
    throw new HttpError("Username harus terdiri dari 3-150 karakter", 400);
  }
  if (!/^[A-Za-z0-9._@-]+$/.test(trimmed)) {
    throw new HttpError(
      "Username hanya boleh mengandung huruf, angka, titik, garis bawah, tanda hubung, dan @",
      400
    );
  }

  return trimmed;
};
