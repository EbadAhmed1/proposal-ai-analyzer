import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, type User } from '../api/axios'

interface AuthContextValue {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null)
  const [token,     setToken]     = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser  = localStorage.getItem('user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser) as User)
    }
    setIsLoading(false)
  }, [])

  const persist = useCallback((u: User, t: string) => {
    setUser(u)
    setToken(t)
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    persist(res.data.data.user, res.data.data.token)
  }, [persist])

  const register = useCallback(async (email: string, password: string) => {
    const res = await authApi.register(email, password)
    persist(res.data.data.user, res.data.data.token)
  }, [persist])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
