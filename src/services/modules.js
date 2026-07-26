import apiClient from '@/api/apiClient'

export const modulesService = {
  get: (id) => apiClient.get(`/modules/${id}`),
  listByProject: (projectId) => apiClient.get(`/projects/${projectId}/modules`),
  update: (id, data) => apiClient.patch(`/modules/${id}`, data),
  // Rebuild every slide design in the module from scratch — each scene/part
  // re-seeded independently from its own script, with one theme applied.
  resetDesigns: (id, theme) => apiClient.post(`/modules/${id}/reset-designs`, { theme }),
}
