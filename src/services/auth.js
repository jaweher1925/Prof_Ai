import apiClient from '@/api/apiClient'

export const authService = {
  signup: (email, password, name) => apiClient.post('/auth/signup', { email, password, name }),
  login:  (email, password)       => apiClient.post('/auth/login',  { email, password }),
  logout: ()                      => apiClient.post('/auth/logout'),
  me:     ()                      => apiClient.get('/auth/me'),
}
