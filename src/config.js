/**
 * Where the backend lives.
 *
 * This used to be hardcoded to localhost:8000 in five separate files, which is
 * fine on a dev machine and fatal once deployed: the browser would try to reach
 * the VISITOR's own port 8000 rather than our server, so every request fails for
 * everyone except the person running the API locally.
 *
 * Set VITE_API_BASE at build time (Vercel: Project -> Settings -> Environment
 * Variables). Vite inlines it into the bundle during `npm run build`, so a change
 * needs a redeploy, not just a restart.
 *
 *   VITE_API_BASE=https://odcat-api.onrender.com/api
 *
 * The localhost fallback is kept deliberately so `npm run dev` works with no .env
 * file at all.
 */
const DEFAULT_BASE = 'http://localhost:8000/api';

/** Full API base, including the trailing `/api`. No trailing slash. */
export const API_BASE = (import.meta.env.VITE_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');

/**
 * Server origin without the `/api` suffix.
 *
 * Needed for things that are not API calls: the Google OAuth redirect, which is a
 * full-page browser navigation to a Laravel route, and `storage/` URLs for
 * uploaded documents.
 */
export const API_ORIGIN = API_BASE.replace(/\/api$/, '');
