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
const REQUIRED = ['DATABASE_URL', 'OPENAI_API_KEY', 'HEYGEN_API_KEY', 'ELEVENLABS_API_KEY']
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
}
