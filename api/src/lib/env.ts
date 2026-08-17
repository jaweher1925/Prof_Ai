/**
 * Single source of truth for environment variables.
 *
 * Loads api/.env into process.env so Azure Functions can access all keys.
 * This runs before any function code.
 *
 * In production (Azure), env vars come from SWA Application Settings instead.
 * The dotenv call is a no-op in production because .env won't be deployed.
 */
import { config } from 'dotenv'
import { join } from 'path'

// Load api/.env — works locally, silently ignored in Azure production
config({ path: join(__dirname, '..', '..', '..', '.env') })

// Validate required keys are present
const REQUIRED = ['DATABASE_URL', 'OPENAI_API_KEY', 'HEYGEN_API_KEY', 'ELEVENLABS_API_KEY', 'JWT_SECRET']
const missing = REQUIRED.filter(k => !process.env[k])

if (missing.length > 0) {
  console.warn(`[env] Missing environment variables: ${missing.join(', ')}`)
  console.warn('[env] Check api/.env and make sure all keys are filled in.')
}

export const env = {
  DATABASE_URL:        process.env.DATABASE_URL || '',
  LOCAL_DEV:           process.env.LOCAL_DEV === 'true',
  OPENAI_API_KEY:      process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL:        process.env.OPENAI_MODEL || 'gpt-4o',
  HEYGEN_API_KEY:      process.env.HEYGEN_API_KEY || '',
  ELEVENLABS_API_KEY:  process.env.ELEVENLABS_API_KEY || '',
  // Optional — enables HyperFrames animated slide backgrounds.
  // Get your key from https://app.heygen.com → Settings → API.
  // Leave blank to use the default static SVG→PNG slide renderer.
  HYPERFRAMES_API_KEY: process.env.HYPERFRAMES_API_KEY || '',
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  AZURE_STORAGE_CONTAINER:         process.env.AZURE_STORAGE_CONTAINER || 'uploads',
  // Signs the session cookie issued by /api/auth/login and /api/auth/signup
  // (see api/src/lib/authTokens.ts). Falls back to a fixed dev-only value so
  // local auth still works before .env is filled in — DO NOT rely on the
  // fallback in production; set a real random JWT_SECRET there.
  JWT_SECRET: process.env.JWT_SECRET || 'insecure-dev-only-secret-change-me',
  // SMTP for the signup email-verification code (api/src/lib/mailer.ts).
  // Not in REQUIRED above — deliberately optional so the app still starts
  // without it; auth/signup.ts surfaces a clear error at signup time instead
  // if these are missing, rather than every unrelated boot failing.
  // Example (Gmail): host=smtp.gmail.com, port=587, user=you@gmail.com,
  // pass=a 16-character App Password (NOT your normal Gmail password —
  // Google blocks plain-password SMTP; generate one at
  // https://myaccount.google.com/apppasswords, requires 2-Step Verification
  // to be on). SMTP_FROM defaults to SMTP_USER if unset.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
}
