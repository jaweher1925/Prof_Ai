import apiClient from '@/api/apiClient'

export const sourceFilesService = {
  listByProject: (projectId) => apiClient.get(`/projects/${projectId}/source-files`),
  create: (data)             => apiClient.post('/source-files', data),
  remove: (id)               => apiClient.delete(`/source-files/${id}`),
}
