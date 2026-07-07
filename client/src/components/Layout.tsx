import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wand2, LogOut, Zap, Menu, X, Briefcase, Sun, Moon, Sparkles, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/jobs',      label: 'Jobs',       icon: Briefcase },
  { to: '/generator', label: 'Generator',  icon: Wand2 },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggleTheme, isDark } = useTheme()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [tier, setTier] = useState<'free' | 'subscribed'>(() => (localStorage.getItem('user_tier') as 'free' | 'subscribed') || 'free')
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)

  // Automatically close sidebar drawer when navigating to a new page on mobile
  useEffect(() => {
    setIsMobileOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)] transition-colors duration-300">
      {/* ── Mobile Header ────────────────────────────────────────────────── */}
      <header className="lg:hidden flex items-center justify-between px-6 h-16 border-b border-[var(--color-border)] bg-[var(--color-sidebar-bg)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-base tracking-tight gradient-text">JobSync AI</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 -mr-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors focus:outline-none"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* ── Mobile Sidebar Backdrop Overlay ─────────────────────────────── */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ── Sidebar (Collapsible Drawer on Mobile, Fixed Sidebar on Desktop) ─ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--color-sidebar-bg)] border-r border-[var(--color-border)] flex flex-col transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo & Close Button */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-base tracking-tight gradient-text">JobSync AI</span>
          </div>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-2 -mr-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors focus:outline-none"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-violet-500/10 dark:bg-violet-600/20 text-violet-600 dark:text-violet-300 border border-violet-500/20'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User Area, Theme Switcher & Sign Out */}
        <div className="px-3 pb-4 border-t border-[var(--color-border)] pt-4 bg-[var(--color-sidebar-bg)] flex-shrink-0 space-y-2">
          {/* Theme switcher option */}
          <button
            onClick={toggleTheme}
            className="flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
          >
            <div className="flex items-center gap-3">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              {theme}
            </span>
          </button>

          <div className="glass px-3 py-3">
            <p className="text-xs font-semibold text-[var(--color-text)] truncate">{user?.email}</p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border)]/40">
              {tier === 'subscribed' ? (
                <div 
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-all select-none"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Subscribed</span>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] select-none">
                    Free Tier
                  </span>
                  <button
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="text-[10px] font-bold text-violet-500 hover:text-violet-400 hover:underline transition-colors"
                  >
                    Upgrade
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-150 active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0 bg-[var(--color-bg-secondary)]">
        {children}
      </main>

      {/* ── Pricing & Upgrades Modal ────────────────────────────────────── */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsUpgradeModalOpen(false)}
          />
          
          {/* Modal Container */}
          <div className="relative w-full max-w-2xl bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden z-10">
            {/* Ambient Background Blob */}
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--color-border)]">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text)]">Choose Your Plan</h2>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Scale your career with AI-powered job matching &amp; proposals</p>
              </div>
              <button 
                onClick={() => setIsUpgradeModalOpen(false)}
                className="p-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
              {/* Card 1: Free Tier */}
              <div className={`glass p-5 flex flex-col justify-between relative transition-all duration-200 ${tier === 'free' ? 'ring-2 ring-violet-500/50' : 'opacity-80 hover:opacity-100'}`}>
                {tier === 'free' && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold text-violet-500 uppercase tracking-wider bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                    Current Plan
                  </span>
                )}
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text)]">Free Tier</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Get started exploring matching jobs &amp; generate standard proposals.</p>
                  
                  <div className="my-5">
                    <span className="text-3xl font-extrabold text-[var(--color-text)]">$0</span>
                    <span className="text-xs text-[var(--color-text-muted)] ml-1">/ forever</span>
                  </div>

                  <ul className="space-y-3.5 text-xs text-[var(--color-text-secondary)] mb-6">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span>3 AI proposals per day</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span>Basic job compatibility score</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span>Sync 3 active job boards</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => {
                    setTier('free');
                    localStorage.setItem('user_tier', 'free');
                    setIsUpgradeModalOpen(false);
                  }}
                  disabled={tier === 'free'}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    tier === 'free' 
                      ? 'bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-muted)] cursor-default'
                      : 'border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] hover:border-[var(--color-text)]'
                  }`}
                >
                  {tier === 'free' ? 'Current Plan' : 'Downgrade to Free'}
                </button>
              </div>

              {/* Card 2: Subscribed Tier */}
              <div className={`glass p-5 flex flex-col justify-between relative transition-all duration-200 bg-gradient-to-b from-[var(--color-glass-bg)] to-violet-950/10 ${tier === 'subscribed' ? 'ring-2 ring-violet-500 border-violet-500/30' : 'opacity-80 hover:opacity-100'}`}>
                {tier === 'subscribed' && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold text-amber-500 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Current Plan
                  </span>
                )}
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-1.5">
                    Subscribed Plan 
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Unlock full capabilities with unlimited generation and advanced analytics.</p>
                  
                  <div className="my-5">
                    <span className="text-3xl font-extrabold text-[var(--color-text)]">$15</span>
                    <span className="text-xs text-[var(--color-text-muted)] ml-1">/ month</span>
                  </div>

                  <ul className="space-y-3.5 text-xs text-[var(--color-text-secondary)] mb-6">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span className="font-medium text-[var(--color-text)]">Unlimited AI proposals</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span>Deep skill gap analysis &amp; feedback</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span>Priority AI generation speed</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-violet-500" />
                      <span>Sync all active job boards instantly</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => {
                    setTier('subscribed');
                    localStorage.setItem('user_tier', 'subscribed');
                    setIsUpgradeModalOpen(false);
                  }}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    tier === 'subscribed' 
                      ? 'bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-muted)] cursor-default'
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/20 active:scale-[0.98]'
                  }`}
                  disabled={tier === 'subscribed'}
                >
                  {tier === 'subscribed' ? 'Active' : 'Upgrade to Subscribed'}
                </button>
              </div>
            </div>
            
            {/* Footer note */}
            <div className="text-[10px] text-center text-[var(--color-text-muted)] mt-4">
              Billing is handled securely via Stripe. Cancel or upgrade at any time.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
