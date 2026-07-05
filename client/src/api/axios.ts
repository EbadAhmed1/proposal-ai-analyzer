import axios from 'axios'

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request interceptor — attach JWT ──────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor — handle 401 globally ───────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  portfolioText: string | null
  extractedSkills: string[]
  jobPreference: string | null
  createdAt: string
}

export interface Proposal {
  id: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  generatedText: string | null
  createdAt: string
  fitScore?: number | null
  matchingSkills?: string[]
  missingSkills?: string[]
  fitReasoning?: string | null
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
  marketSharePercent: number
  growthPercent: number
  topStacks: string[]
  hotProjects: string[]
}

export interface TrendsData {
  domains: DomainTrend[]
  lastUpdated: string
}

export interface Job {
  id: string
  title: string
  company: string
  location: string
  locationType: 'remote' | 'onsite' | 'hybrid'
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  applyUrl: string
  source: string
  requiredSkills: string[]
  postedAt: string
  matchPercent?: number
}

export interface FitReport {
  score: number
  matchingSkills: string[]
  missingSkills: string[]
  reasoning: string
}

export interface CVUploadResult {
  fileName: string
  charCount: number
  extractedSkills: string[]
  skillCount: number
  summary: string
  portfolioTextPreview: string
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ data: { user: User; token: string } }>('/auth/login', { email, password }),
  register: (email: string, password: string) =>
    api.post<{ data: { user: User; token: string } }>('/auth/register', { email, password }),
}

// Users
export const userApi = {
  getProfile: () => api.get<{ data: { user: User } }>('/users/profile'),
  updateProfile: (portfolioText: string) =>
    api.put<{ data: { user: User } }>('/users/profile', { portfolioText }),
}

// CV
export const cvApi = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('cv', file)
    return api.post<{ data: CVUploadResult }>('/cv/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },
  getSkills: () =>
    api.get<{ data: { extractedSkills: string[]; skillCount: number; jobPreference: string; hasPortfolioText: boolean } }>('/cv/skills'),
  updatePreference: (jobPreference: string) =>
    api.put<{ data: { jobPreference: string } }>('/cv/preference', { jobPreference }),
}

// Jobs
export const jobApi = {
  getTrends: () => api.get<{ data: TrendsData }>('/jobs/trends'),
  search: (preference?: string, skills?: string[]) =>
    api.get<{ data: { jobs: Job[]; total: number; message?: string } }>('/jobs/search', {
      params: {
        ...(preference ? { preference } : {}),
        ...(skills && skills.length > 0 ? { skills: skills.join(',') } : {}),
      },
    }),
  getById: (id: string) =>
    api.get<{ data: { job: Job & { description: string } } }>(`/jobs/${id}`),
  getFitReport: (jobId: string) =>
    api.get<{ data: FitReport }>(`/jobs/${jobId}/fit`),
}

// Proposals
export const proposalApi = {
  generate: (payload: {
    jobTitle?: string
    jobDescription: string
    jobSource?: string
    fitScore?: number
    matchingSkills?: string[]
    missingSkills?: string[]
    fitReasoning?: string
  }) =>
    api.post<{ data: { proposalId: string; status: string } }>('/proposals/generate', payload),
  getById: (id: string) =>
    api.get<{ data: { proposal: Proposal } }>(`/proposals/${id}`),
  list: () =>
    api.get<{ data: { proposals: Proposal[]; total: number } }>('/proposals'),
  refine: (id: string, refinementInstruction: string) =>
    api.post<{ data: { proposalId: string; status: string } }>(`/proposals/${id}/refine`, { refinementInstruction }),
  analyzeFit: (payload: { jobTitle?: string; jobDescription: string }) =>
    api.post<{ data: { score: number; matchingSkills: string[]; missingSkills: string[]; reasoning: string } }>('/proposals/analyze-fit', payload),
}
