import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { env } from "./config/env";
import { authLimiter, uploadLimiter } from "./middleware/rate-limit";
import registerController from "./register/register.controller";
import locationController from "./profile/location/location.controller";
import qiudaoController from "./profile/qiudao/qiudao.controller";
import userController from "./profile/user/user.controller";
import loginController from "./login/login.controller";
import exportController from "./export/export.controller";
import importController from "./import/import.controller";
import dianchuanshiController from "./dianchuanshi/dianchuanshi.controller";
import fotangController from "./fotang/fotang.controller";
import eventController from "./event/event.controller";
import roleController from "./role/role.controller";
import institutionRouter from "./institution/institution.controller";
import changePasswordController from "./auth/change-password.controller";
import dashboardController from "./dashboard/dashboard.controller";

const app = express();
app.disable("x-powered-by");

// Set TRUST_PROXY=1 when running behind Nginx (or another reverse proxy) so
// req.ip reflects the real client address. Without it, rate limiting and
// logging would only ever see the proxy's IP.
const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy && trustProxy !== "0" && trustProxy !== "false") {
  const parsed =
    trustProxy === "true" ? 1 : Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy);
  app.set("trust proxy", parsed);
}

app.use(
  helmet({
    // Images are served from this API and embedded by the frontend on another origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
    // Avoid pinning HTTPS for local HTTP development.
    strictTransportSecurity: env.isProduction ? undefined : false,
  })
);

app.use(
  cors({
    origin: env.allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const uploadPath = path.resolve(__dirname, "../public/uploads");

try {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  fs.accessSync(uploadPath, fs.constants.R_OK | fs.constants.W_OK);
} catch (err) {
  console.error("Error setting up uploads directory:", err);
}

// express.static normalizes paths and rejects traversal attempts, unlike a
// manual path.join + existsSync check. dotfiles are never served.
const staticOptions = {
  dotfiles: "deny" as const,
  index: false,
  fallthrough: false,
  maxAge: "1h",
};
app.use("/uploads", express.static(uploadPath, staticOptions));

app.get("/", (_req: Request, res: Response) => {
  res.send("OneMapan Backend");
});

// Lightweight health endpoint used by Docker/systemd health checks and
// uptime monitoring. It intentionally does not touch the database.
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/register", authLimiter, registerController);
app.use("/profile/location", locationController);
app.use("/profile/qiudao", qiudaoController);
app.use("/profile/user", userController);
app.use("/login", authLimiter, loginController);
app.use("/export", exportController);
app.use("/import", uploadLimiter, importController);
app.use("/dianchuanshi", dianchuanshiController);
app.use("/fotang", fotangController);
app.use("/event", eventController);
app.use("/role", roleController);
app.use("/institution", institutionRouter);
app.use("/change-password", authLimiter, changePasswordController);
app.use("/dashboard", dashboardController);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return;
  }

  let statusCode = err.statusCode || err.status || 500;

  // multer errors (e.g. file too large) are client errors.
  if (typeof err.code === "string" && err.code.startsWith("LIMIT_")) {
    statusCode = 400;
  }

  if (statusCode >= 500) {
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal server error" : err.message || "Request gagal",
  });
});

app.listen(env.port, env.host, () => {
  console.log(`OneMapan backend running on http://${env.host}:${env.port}`);
});
