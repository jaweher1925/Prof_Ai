import apiClient from '@/api/apiClient'

export const adminService = {
  stats:          ()               => apiClient.get('/admin/stats'),
  listUsers:      ()               => apiClient.get('/admin/users'),
  createUser:     (data)           => apiClient.post('/admin/users', data),
  updateUser:     (id, data)       => apiClient.patch(`/admin/users/${id}`, data),
  updateUserRole: (id, role)       => apiClient.patch(`/admin/users/${id}`, { role }),
  deleteUser:     (id)             => apiClient.delete(`/admin/users/${id}`),
  // "Delete all users except admin" cleanup — role='admin' accounts are
  // excluded server-side, so this can never wipe out every admin.
  purgeNonAdmins: ()               => apiClient.post('/admin/users/purge-non-admin'),
  listProjects:   ()               => apiClient.get('/admin/projects'),
  getSettings:    ()               => apiClient.get('/admin/settings'),
  updateSettings: (settings)       => apiClient.patch('/admin/settings', settings),
}
