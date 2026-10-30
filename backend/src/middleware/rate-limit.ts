import rateLimit from "express-rate-limit";

const commonOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
};

export const authLimiter = rateLimit({
  ...commonOptions,
  limit: 10,
  message: { message: "Terlalu banyak percobaan. Silakan coba lagi nanti." },
});

export const uploadLimiter = rateLimit({
  ...commonOptions,
  limit: 30,
  message: { message: "Terlalu banyak unggahan. Silakan coba lagi nanti." },
});
