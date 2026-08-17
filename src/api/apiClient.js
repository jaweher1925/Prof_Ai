import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // Same-origin (proxied) requests send cookies by default, but withCredentials
  // makes that explicit — this is what carries the pa_session login cookie
  // (see api/src/lib/authTokens.ts) on every request.
  withCredentials: true,
})

apiClient.interceptors.response.use(
  (res) => {
    // 204 No Content — success with no body (DELETE responses)
    if (res.status === 204) return null

    // If Vite SPA fallback returns HTML instead of JSON, treat as no backend
    const contentType = res.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
      return Promise.reject({ status: 0, message: 'No backend — run npm start in the api folder' })
    }

    return res.data
  },
  (err) => {
    const status = err.response?.status
    const message = err.response?.data?.error || err.message || 'Unknown error'
    // No auto-redirect here (there used to be one, to the old SWA AAD login
    // URL) — a 401 is a perfectly normal response for things like "check if
    // I'm logged in" or "wrong password on the login form", and the caller
    // needs to see it to react correctly (show an inline error, know to show
    // the login page, etc.). AppLayout's route guard is what actually sends
    // a signed-out user to /login, based on AuthContext's isAuthenticated
    // state — not a blanket rule here.
    //
    // `data` (the full error response body, not just `.error`) is included
    // so callers can read extra structured fields beyond the message — e.g.
    // login.ts's 403 for an unverified account also sends { needsVerification,
    // email }, which Login.jsx needs to route to the verify-code screen
    // instead of just displaying the message inline.
    return Promise.reject({ status, message, data: err.response?.data })
  }
)

export default apiClient
