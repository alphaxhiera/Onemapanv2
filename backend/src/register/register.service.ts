import bcrypt from "bcrypt";
import { findExistingUsername, createUserCredential } from "./register.repository";
import { UserCredential } from "@prisma/client";
import { assertStrongPassword, assertValidUsername } from "../utils/password";
import { HttpError } from "../utils/http-error";

export const registerCredential = async (
  username: unknown,
  password: unknown
): Promise<UserCredential> => {
  const normalizedUsername = assertValidUsername(username);

  if (typeof password !== "string" || !password) {
    throw new HttpError("Username dan password wajib diisi", 400);
  }
  assertStrongPassword(password);

  const existing = await findExistingUsername(normalizedUsername);
  if (existing) {
    throw new HttpError("Username sudah digunakan", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const newCredential = await createUserCredential({
    username: normalizedUsername,
    hashed_password: hashedPassword,
  });

  return newCredential;
};
