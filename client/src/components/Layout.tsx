import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wand2, LogOut, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/generator', label: 'Generator',  icon: Wand2 },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-full">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-white/5 bg-zinc-900/50">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-base tracking-tight gradient-text">ProposeAI</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User area */}
        <div className="px-3 pb-4 border-t border-white/5 pt-4">
          <div className="glass px-3 py-3 mb-2">
            <p className="text-xs font-semibold text-slate-300 truncate">{user?.email}</p>
            <p className="text-xs text-slate-500 mt-0.5">Freelancer</p>
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
