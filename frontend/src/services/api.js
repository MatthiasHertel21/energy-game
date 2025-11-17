import axios from 'axios'

const base = import.meta.env.VITE_API_BASE || ''
const instance = axios.create({ baseURL: base })

// Flag to prevent multiple refresh attempts
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

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
  async (error) => {
    const originalRequest = error.config

    // Handle 401 errors with token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request while refresh is in progress
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return instance(originalRequest)
        }).catch(err => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        // No refresh token available, logout user
        isRefreshing = false
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      try {
        // Attempt to refresh the token
        const { data } = await axios.post(`${base}/api/auth/refresh`, {}, {
          headers: { Authorization: `Bearer ${refreshToken}` }
        })

        // Update tokens in localStorage
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        localStorage.setItem('user', JSON.stringify(data.user))

        // Update the failed request with new token
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`
        
        processQueue(null, data.access_token)
        isRefreshing = false

        // Retry the original request
        return instance(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        isRefreshing = false

        // Refresh failed, logout user
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        
        return Promise.reject(refreshError)
      }
    }

    // Show error message in snackbar for non-401 errors
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