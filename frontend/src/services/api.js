import axios from 'axios'

const base = import.meta.env.VITE_API_BASE || ''
const instance = axios.create({ baseURL: base })

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default instance

// Global error handler: surface as snackbar if available
instance.interceptors.response.use(
  (resp) => resp,
  (error) => {
    try {
      const msg = error?.response?.data?.message || error?.message || 'Request failed'
      // Try both __snack and __showSnack (new alias)
      if (typeof window !== 'undefined') {
        if (typeof window.__showSnack === 'function') {
          window.__showSnack(msg, 'error')
        } else if (typeof window.__snack === 'function') {
          window.__snack(msg, { severity: 'error' })
        }
      }
    } catch (_) {
      // no-op
    }
    return Promise.reject(error)
  }
)