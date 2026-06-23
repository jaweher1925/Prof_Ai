import apiClient from '@/api/apiClient'

export const modulesService = {
  get: (id) => apiClient.get(`/modules/${id}`),
  listByProject: (projectId) => apiClient.get(`/projects/${projectId}/modules`),
  update: (id, data) => apiClient.patch(`/modules/${id}`, data),
}
