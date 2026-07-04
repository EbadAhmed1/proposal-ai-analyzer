import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, RefreshCw, AlertCircle, Flame, ChevronRight,
} from 'lucide-react'
import { jobApi, type TrendsData, type DomainTrend } from '../api/axios'
import { useAuth } from '../contexts/AuthContext'

// ── Bar colours for demand chart ─────────────────────────────────────────
const DOMAIN_COLORS = [
  '#7c3aed', '#6d28d9', '#4f46e5', '#4338ca', '#8b5cf6', '#a78bfa',
]

// ── Custom tooltip for the bar chart ─────────────────────────────────────
function MarketShareTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-sm shadow-xl">
      <p className="font-semibold text-slate-100">{label}</p>
      <p className="text-violet-400">Market Share: {payload[0].value}%</p>
    </div>
  )
}

// ── Domain detail card ───────────────────────────────────────────────────
function DomainCard({ domain }: { domain: DomainTrend }) {
  return (
    <div className="glass p-5 hover:bg-white/[0.07] transition-colors duration-200 group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold text-slate-100 leading-tight">
            {domain.domain}
          </h3>
        </div>
        
        {/* Growth percentage badge with custom hover tooltip explanation */}
        <div className="relative group/tooltip">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full cursor-help transition-all duration-200 ${
            domain.growthPercent >= 30
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
              : domain.growthPercent >= 15
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
              : 'bg-slate-500/15 text-slate-400 border border-white/5'
          }`}>
            +{domain.growthPercent}%
          </span>
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover/tooltip:block z-10 bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 shadow-xl font-medium w-48 text-center animate-fade-in pointer-events-none">
            Year-over-Year demand growth: <span className="text-emerald-400 font-bold">+{domain.growthPercent}%</span>
          </div>
        </div>
      </div>

      {/* Market Share bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Market Share
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{domain.marketSharePercent}%</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-700 ease-out"
            style={{ width: `${domain.marketSharePercent}%` }}
          />
        </div>
      </div>

      {/* Top Stacks */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 flex items-center gap-1">
          <Flame className="w-3 h-3 text-orange-400" />
          Top Tech Stacks
        </p>
        <div className="flex flex-wrap gap-1.5">
          {domain.topStacks.map((stack) => (
            <span
              key={stack}
              className="px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/15 text-[11px] font-medium text-violet-300"
            >
              {stack}
            </span>
          ))}
        </div>
      </div>

      {/* Hot Projects */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
          Popular Project Types
        </p>
        <ul className="space-y-1">
          {domain.hotProjects.map((project) => (
            <li key={project} className="flex items-center gap-1.5 text-xs text-slate-400">
              <ChevronRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
              {project}
            </li>
          ))}
        </ul>
      </div>
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

  useEffect(() => {
    fetchTrends()
  }, [])

  // Sort domains by market share percentage for the chart
  const chartData = trends?.domains
    ?.slice()
    .sort((a, b) => b.marketSharePercent - a.marketSharePercent)
    .map((d) => ({ name: d.domain, marketSharePercent: d.marketSharePercent }))
    ?? []

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
          Good {getGreeting()}, <span className="gradient-text">{authUser?.email?.split('@')[0]}</span>
        </h1>
        <p className="text-slate-400 mt-1 text-sm">Here's what's trending in the freelance tech market.</p>
      </div>

      {/* ── Market Trends Section ─────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="glass p-5 sm:p-6">
          {/* Section header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 flex-wrap">
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
              {trends?.lastUpdated && (
                <span className="text-[10px] text-slate-600 font-mono hidden sm:inline">
                  Updated {new Date(trends.lastUpdated).toLocaleDateString()}
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
              <span className="hidden sm:inline">Refresh</span>
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
              {/* ── Market Share Chart ────────────────────────────────────── */}
              <div className="mb-8">
                <p className="text-xs text-slate-500 mb-4 font-medium">Domain market share · percentage of freelance tech job market</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickFormatter={(val) => `${val}%`}
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={160}
                      tick={{ fill: '#cbd5e1', fontSize: 11, fontFamily: 'Inter' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<MarketShareTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="marketSharePercent" radius={[0, 6, 6, 0]} barSize={20}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={DOMAIN_COLORS[i % DOMAIN_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Domain Detail Cards ──────────────────────────────────── */}
              <div>
                <p className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
                  <Flame className="w-3 h-3 text-orange-400" />
                  Top tech stacks &amp; in-demand project types per domain
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {trends.domains
                    .slice()
                    .sort((a, b) => b.marketSharePercent - a.marketSharePercent)
                    .map((domain) => (
                      <DomainCard key={domain.domain} domain={domain} />
                    ))
                  }
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
