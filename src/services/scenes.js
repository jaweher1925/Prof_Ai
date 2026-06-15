import apiClient from '@/api/apiClient'

export const scenesService = {
  listByModule: (moduleId) => apiClient.get(`/modules/${moduleId}/scenes`),
  get:    (id)        => apiClient.get(`/scenes/${id}`),
  update: (id, data)  => apiClient.patch(`/scenes/${id}`, data),
  approve: (id)       => apiClient.post(`/scenes/${id}/approve`),
}
