// In dev (Vite on :5173) and prod, calls go to the same origin and the
// server (or Vite proxy) routes /api/* to the Flask backend. In production
// the backend serves the built bundle, so window.location.origin is correct.
export const API_BASE = window.location.origin;

export function extractVideoId(url) {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /^([a-zA-Z0-9_-]{11})$/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
