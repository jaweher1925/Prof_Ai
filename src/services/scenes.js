import apiClient from '@/api/apiClient'

export const scenesService = {
  // Rebuild this ONE scene's design(s) from scratch (each part re-seeded from
  // its own script). Optional theme; defaults to the scene's current theme.
  resetDesign: (sceneId, theme) => apiClient.post(`/scenes/${sceneId}/reset-design`, { theme }),
  listByModule: (moduleId) => apiClient.get(`/modules/${moduleId}/scenes`),
  get:    (id)        => apiClient.get(`/scenes/${id}`),
  update: (id, data)  => apiClient.patch(`/scenes/${id}`, data),
  approve: (id)       => apiClient.post(`/scenes/${id}/approve`),
  updateElementTiming: (sceneId, timingData) => 
    apiClient.patch(`/scenes/${sceneId}/element-timing`, timingData),
}
