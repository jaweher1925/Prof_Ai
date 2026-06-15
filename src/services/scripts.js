import apiClient from '@/api/apiClient'

export const scriptsService = {
  listByProject: (projectId) => apiClient.get(`/projects/${projectId}/scripts`),
  get:    (id)        => apiClient.get(`/scripts/${id}`),
  update: (id, data)  => apiClient.patch(`/scripts/${id}`, data),
}
