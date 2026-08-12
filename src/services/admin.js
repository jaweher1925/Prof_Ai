import apiClient from '@/api/apiClient'

export const adminService = {
  stats:          ()               => apiClient.get('/admin/stats'),
  listUsers:      ()               => apiClient.get('/admin/users'),
  updateUserRole: (id, role)       => apiClient.patch(`/admin/users/${id}`, { role }),
  listProjects:   ()               => apiClient.get('/admin/projects'),
  getSettings:    ()               => apiClient.get('/admin/settings'),
  updateSettings: (settings)       => apiClient.patch('/admin/settings', settings),
}
