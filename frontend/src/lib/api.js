// Base URL of the OneMapan backend API.
// Set NEXT_PUBLIC_API_URL at build time for non-local environments,
// e.g. NEXT_PUBLIC_API_URL=https://your-domain.com/api
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:2025";
