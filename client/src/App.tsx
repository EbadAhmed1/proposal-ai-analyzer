import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Generator from './pages/Generator'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="h-full">
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected — wrapped in persistent sidebar Layout */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/generator"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Generator />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* Catch-all → login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
