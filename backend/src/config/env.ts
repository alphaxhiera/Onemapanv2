import dotenv from "dotenv";
import path from "path";

// Load backend/.env regardless of the directory the process was started from.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const requireEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. Set it in backend/.env before starting the server.`
    );
  }
  return value;
};

const jwtSecret = requireEnv("JWT_SECRET");

// Guard against placeholder/short secrets that would make tokens forgeable.
if (
  jwtSecret.length < 32 ||
  jwtSecret === "your_jwt_secret_here" ||
  jwtSecret === "your-secret-key"
) {
  throw new Error(
    "JWT_SECRET must be at least 32 characters long and must not be a placeholder value."
  );
}

const parseOrigins = (value: string | undefined): string[] =>
  (value || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: parsePositiveInt(process.env.PORT, 2025),
  // Set HOST=127.0.0.1 when the API is only reached through a local reverse
  // proxy (Nginx), so it is not directly reachable from the internet.
  host: process.env.HOST?.trim() || "0.0.0.0",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  serverBaseUrl: process.env.SERVER_BASE_URL?.replace(/\/$/, ""),
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  uploadMaxFileSize: parsePositiveInt(process.env.UPLOAD_MAX_FILE_SIZE, 5 * 1024 * 1024),
};
