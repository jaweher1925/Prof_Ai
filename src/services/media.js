import apiClient from '@/api/apiClient'

export const mediaService = {
  listAvatars: () => apiClient.get('/listHeyGenAvatars'),
  listVoices:  () => apiClient.get('/listElevenLabsVoices'),
}
