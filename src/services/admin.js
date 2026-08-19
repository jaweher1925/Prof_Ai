import apiClient from '@/api/apiClient'

// Route prefix is `/console-api/...`, NOT `/admin/...` or `/admin-api/...` —
// see the comment atop api/src/functions/admin/admin.ts: Azure Functions
// rejects ANY route or function name starting with "admin" (a prefix match,
// not exact-segment — 'admin-api/...' collided too), which is why every
// admin endpoint 404'd until routes were renamed off that prefix entirely.
// Keep this in sync with admin.ts.
export const adminService = {
  stats:          ()               => apiClient.get('/console-api/stats'),
  spendByUser:    ()               => apiClient.get('/console-api/spend-by-user'),
  listUsers:      ()               => apiClient.get('/console-api/users'),
  getUser:        (id)             => apiClient.get(`/console-api/users/${id}`),
  createUser:     (data)           => apiClient.post('/console-api/users', data),
  updateUser:     (id, data)       => apiClient.patch(`/console-api/users/${id}`, data),
  updateUserRole: (id, role)       => apiClient.patch(`/console-api/users/${id}`, { role }),
  deleteUser:     (id)             => apiClient.delete(`/console-api/users/${id}`),
  // "Delete all users except admin" cleanup — role='admin' accounts are
  // excluded server-side, so this can never wipe out every admin.
  purgeNonAdmins: ()               => apiClient.post('/console-api/users/purge-non-admin'),
  listProjects:   ()               => apiClient.get('/console-api/projects'),
  getProject:     (id)             => apiClient.get(`/console-api/projects/${id}`),
  updateProject:  (id, data)       => apiClient.patch(`/console-api/projects/${id}`, data),
  deleteProject:  (id)             => apiClient.delete(`/console-api/projects/${id}`),
  getSettings:    ()               => apiClient.get('/console-api/settings'),
  updateSettings: (settings)       => apiClient.patch('/console-api/settings', settings),
}
