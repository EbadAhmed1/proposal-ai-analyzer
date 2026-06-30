import { useState, useEffect, type FormEvent } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { TrendingUp, User, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { jobApi, userApi, type TrendsData } from '../api/axios'
import { useAuth } from '../contexts/AuthContext'

// ── Bar colours cycling through violet → indigo shades ───────────────────
const BAR_COLORS = ['#7c3aed', '#6d28d9', '#4f46e5', '#4338ca', '#8b5cf6']

// ── Custom tooltip ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-sm shadow-xl">
      <p className="font-semibold text-slate-100">{label}</p>
      <p className="text-violet-400">{payload[0].value} jobs</p>
    </div>
  )
}

export default function Dashboard() {
  const { user: authUser } = useAuth()

  // ── Trends state ─────────────────────────────────────────────────────────
  const [trends,        setTrends]        = useState<TrendsData | null>(null)
  const [trendsLoading, setTrendsLoading] = useState(true)
  const [trendsError,   setTrendsError]   = useState<string | null>(null)
  const [cacheStatus,   setCacheStatus]   = useState<string>('')

  // ── Profile state ─────────────────────────────────────────────────────────
  const [portfolio,      setPortfolio]      = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [saveStatus,     setSaveStatus]     = useState<'idle' | 'saved' | 'error'>('idle')

  // ── Fetch trends ──────────────────────────────────────────────────────────
  const fetchTrends = async () => {
    setTrendsLoading(true)
    setTrendsError(null)
    try {
      const res = await jobApi.getTrends()
      setTrends(res.data.data)
      setCacheStatus((res.headers as Record<string, string>)['x-cache'] ?? '')
    } catch {
      setTrendsError('Failed to load market trends. Check that the API server is running.')
    } finally {
      setTrendsLoading(false)
    }
  }

  // ── Fetch profile ─────────────────────────────────────────────────────────
  const fetchProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await userApi.getProfile()
      setPortfolio(res.data.data.user.portfolioText ?? '')
    } catch {
      // non-fatal
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    fetchTrends()
    fetchProfile()
  }, [])

  // ── Save portfolio ────────────────────────────────────────────────────────
  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveStatus('idle')
    try {
      await userApi.updateProfile(portfolio)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100">
          Good {getGreeting()}, <span className="gradient-text">{authUser?.email?.split('@')[0]}</span>
        </h1>
        <p className="text-slate-400 mt-1 text-sm">Here's what's trending in the freelance market today.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* ── Market Trends (3/5 width) ──────────────────────────────────── */}
        <section className="xl:col-span-3">
          <div className="glass p-6 h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="section-title">Market Trends</h2>
                {cacheStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                    cacheStatus === 'HIT'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {cacheStatus === 'HIT' ? '⚡ cached' : '🔄 fresh'}
                  </span>
                )}
              </div>
              <button
                onClick={fetchTrends}
                disabled={trendsLoading}
                className="btn-ghost"
                aria-label="Refresh trends"
              >
                <RefreshCw className={`w-4 h-4 ${trendsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {trendsLoading ? (
              <div className="flex flex-col items-center justify-center h-56 gap-3">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Loading market data…</p>
              </div>
            ) : trendsError ? (
              <div className="flex items-center gap-2 text-red-400 text-sm p-4 bg-red-500/10 rounded-xl">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {trendsError}
              </div>
            ) : trends ? (
              <>
                <p className="text-xs text-slate-500 mb-4">Top in-demand skills · job count</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trends.topSkills} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="skill"
                      tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'Inter' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'Inter' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="jobCount" radius={[6, 6, 0, 0]}>
                      {trends.topSkills.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Growth badges */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {trends.topSkills.map((s) => (
                    <div key={s.skill} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-xs">
                      <span className="text-slate-300 font-medium">{s.skill}</span>
                      <span className="text-emerald-400">+{s.growthPercent}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>

        {/* ── Portfolio Profile (2/5 width) ─────────────────────────────── */}
        <section className="xl:col-span-2">
          <div className="glass p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-indigo-400" />
              </div>
              <h2 className="section-title">My Portfolio</h2>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Describe your skills, experience, and past wins. The AI uses this to personalise every proposal.
            </p>

            <form onSubmit={handleSave} className="flex flex-col flex-1 gap-3">
              {profileLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <textarea
                  id="portfolio-textarea"
                  value={portfolio}
                  onChange={(e) => setPortfolio(e.target.value)}
                  placeholder="e.g. Full-stack developer with 5 years experience in React and Node.js. Built 3 SaaS products from 0→$10k MRR. Strong in TypeScript, PostgreSQL, and cloud deployments…"
                  className="input flex-1 resize-none min-h-[200px] leading-relaxed"
                  maxLength={10000}
                />
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">{portfolio.length}/10,000</span>
                <button
                  type="submit"
                  id="save-portfolio-btn"
                  disabled={saving || profileLoading}
                  className={`btn-primary ${
                    saveStatus === 'saved'
                      ? '!from-emerald-600 !to-teal-600'
                      : saveStatus === 'error'
                      ? '!from-red-600 !to-red-700'
                      : ''
                  }`}
                >
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : saveStatus === 'saved' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? 'Saving…' : saveStatus === 'saved' ? 'Saved!' : 'Save Portfolio'}
                </button>
              </div>

              {saveStatus === 'error' && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Failed to save. Please try again.
                </p>
              )}
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
