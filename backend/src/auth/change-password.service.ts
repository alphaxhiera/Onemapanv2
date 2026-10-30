import bcrypt from "bcrypt";
import prisma from "../db";
import { assertStrongPassword } from "../utils/password";
import { HttpError, badRequest } from "../utils/http-error";

export const changeUserPassword = async (
    userId: string,
    oldPassword: unknown,
    newPassword: unknown
): Promise<void> => {
    if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
        throw badRequest("Password lama dan baru wajib diisi");
    }

    if (!oldPassword || !newPassword) {
        throw badRequest("Password lama dan baru wajib diisi");
    }

    assertStrongPassword(newPassword);

    if (oldPassword === newPassword) {
        throw badRequest("Password baru tidak boleh sama dengan password lama");
    }

    const credential = await prisma.userCredential.findFirst({
        where: {
            user: {
                user_info_id: userId,
            },
        },
    });

    if (!credential) {
        throw new HttpError("Akun tidak ditemukan atau belum memiliki credential", 404);
    }

    if (!credential.hashed_password) {
        throw new HttpError("Data password rusak. Hubungi administrator.", 500);
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, credential.hashed_password);

    if (!isOldPasswordValid) {
        throw new HttpError("Password lama salah", 400);
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await prisma.userCredential.update({
        where: {
            user_credential: credential.user_credential,
        },
        data: {
            hashed_password: hashedNewPassword,
        },
    });
};
