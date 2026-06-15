import axios from 'axios'

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
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
    // Only redirect to SWA login in production — not on localhost
    if ((status === 401 || status === 403) && !IS_LOCAL) {
      window.location.href = '/.auth/login/aad'
    }
    return Promise.reject({ status, message })
  }
)

export default apiClient
