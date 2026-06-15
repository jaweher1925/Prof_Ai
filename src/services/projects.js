import apiClient from '@/api/apiClient'

export const projectsService = {
  list: ()           => apiClient.get('/projects'),
  get:  (id)         => apiClient.get(`/projects/${id}`),
  create: (data)     => apiClient.post('/projects', data),
  update: (id, data) => apiClient.patch(`/projects/${id}`, data),
  remove: (id)       => apiClient.delete(`/projects/${id}`),
}
