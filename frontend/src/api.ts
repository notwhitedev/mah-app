const DEFAULT_API_BASE = 'http://localhost:3000/api'

const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_BASE).replace(/\/$/, '')

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'API request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const cloudApi = {
  health: () => apiRequest<{ ok: boolean; message: string; mode: string }>('/health'),
  login: (payload: { username: string; password: string }) => apiRequest<{ user: any }>('/users/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getUsers: () => apiRequest<any[]>('/users'),
  createUser: (payload: Record<string, any>) => apiRequest<any>('/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteUser: (id: string) => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  getCustomers: (ownerId?: string) => apiRequest<any[]>(`/customers${ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : ''}`),
  createCustomer: (payload: Record<string, any>) => apiRequest<any>('/customers', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateCustomer: (id: string, payload: Record<string, any>) => apiRequest<any>(`/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
  deleteCustomer: (id: string) => apiRequest(`/customers/${id}`, { method: 'DELETE' }),
  createTransaction: (customerId: string, payload: Record<string, any>) => apiRequest<any>(`/customers/${customerId}/transactions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export { API_BASE_URL }
