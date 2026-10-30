import { Router, Request, Response } from "express";
import { registerCredential } from "./register.service";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body ?? {};

    await registerCredential(username, password);

    res.status(201).json({ message: "Username berhasil dibuat" });
  } catch (error: any) {
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({
      message: statusCode >= 500 ? "Terjadi kesalahan saat registrasi" : error.message,
    });
  }
});

export default router;
