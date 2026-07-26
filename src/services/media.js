import apiClient from '@/api/apiClient'

// The HeyGen avatar list is slow to fetch (~6s on a cold call — it hits the
// HeyGen API) and it barely ever changes. react-query caches it in memory, but
// that cache is wiped when the app is closed and reopened, so on every fresh
// launch the presenter photo stayed blank for several seconds while this
// refetched. Mirror the last successful result into localStorage so the UI can
// paint the cached avatars INSTANTLY on reopen, then revalidate in the
// background — the network result quietly replaces the cache if anything moved.
const AVATARS_CACHE_KEY = 'profai:heygen-avatars'
const VOICES_CACHE_KEY  = 'profai:elevenlabs-voices'

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch { return undefined }
}
function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota/full — non-fatal */ }
}

export const mediaService = {
  listAvatars: async () => {
    const res = await apiClient.get('/listHeyGenAvatars')
    if (res?.avatars?.length) writeCache(AVATARS_CACHE_KEY, res)
    return res
  },
  listVoices: async () => {
    const res = await apiClient.get('/listElevenLabsVoices')
    if (res?.voices?.length) writeCache(VOICES_CACHE_KEY, res)
    return res
  },
  // Synchronous last-known-good reads — pass as react-query `initialData` so a
  // fresh page load shows the cached data immediately instead of a blank slot.
  cachedAvatars: () => readCache(AVATARS_CACHE_KEY),
  cachedVoices:  () => readCache(VOICES_CACHE_KEY),
}
