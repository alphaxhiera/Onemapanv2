import { Router, Request, Response } from "express";
import { loginUser } from "./login.service";

const router = Router();

router.post("/", (req: Request, res: Response) => {
  void (async () => {
    try {
      const result = await loginUser(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        console.error("Login error:", error);
      }
      res.status(statusCode).json({
        message: statusCode >= 500 ? "Internal server error" : error.message,
      });
    }
  })();
});

export default router;
