import apiClient from '@/api/apiClient'

export const authService = {
  signup: (email, password, name) => apiClient.post('/auth/signup', { email, password, name }),
  login:  (email, password)       => apiClient.post('/auth/login',  { email, password }),
  logout: ()                      => apiClient.post('/auth/logout'),
  me:     ()                      => apiClient.get('/auth/me'),
  // Email verification (2026-08-15) — signup no longer logs in immediately;
  // these two complete that flow. See api/src/functions/auth/verify.ts and
  // auth/resendCode.ts.
  verify:     (email, code) => apiClient.post('/auth/verify', { email, code }),
  resendCode: (email)       => apiClient.post('/auth/resend-code', { email }),
}
