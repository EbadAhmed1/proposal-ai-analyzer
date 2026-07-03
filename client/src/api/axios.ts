import axios from 'axios'

// ── Axios instance ─────────────────────────────────────────────────────────
// All requests go through Vite's proxy (/api → http://localhost:5000/api)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ── Request interceptor — attach JWT ──────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor — handle 401 globally ───────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid → clear storage and force re-login
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// ── Typed API helpers ────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  portfolioText: string | null
  createdAt: string
}

export interface Proposal {
  id: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  generatedText: string | null
  createdAt: string
  jobPosting: {
    title: string
    description: string
    source: string
    requiredSkills: string[]
    createdAt: string
  }
}

export interface DomainTrend {
  domain: string
  demandScore: number
  growthPercent: number
  icon: string
  topStacks: string[]
  hotProjects: string[]
}

export interface TrendsData {
  domains: DomainTrend[]
  lastUpdated: string
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ data: { user: User; token: string } }>('/auth/login', { email, password }),
  register: (email: string, password: string) =>
    api.post<{ data: { user: User; token: string } }>('/auth/register', { email, password }),
}

// Users
export const userApi = {
  getProfile: () =>
    api.get<{ data: { user: User } }>('/users/profile'),
  updateProfile: (portfolioText: string) =>
    api.put<{ data: { user: User } }>('/users/profile', { portfolioText }),
}

// Jobs
export const jobApi = {
  getTrends: () =>
    api.get<{ data: TrendsData }>('/jobs/trends'),
}

// Proposals
export const proposalApi = {
  generate: (payload: { jobTitle?: string; jobDescription: string; jobSource?: string }) =>
    api.post<{ data: { proposalId: string; status: string } }>('/proposals/generate', payload),
  getById: (id: string) =>
    api.get<{ data: { proposal: Proposal } }>(`/proposals/${id}`),
  list: () =>
    api.get<{ data: { proposals: Proposal[]; total: number } }>('/proposals'),
}
