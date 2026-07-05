import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Briefcase, MapPin, DollarSign, ExternalLink,
  ChevronRight, AlertCircle, Loader2, X, Wand2,
  CheckCircle2, XCircle, Zap, RefreshCw, Building2,
  Wifi, WifiOff, Globe, Upload, Sparkles, FileText,
  Plus, RotateCcw
} from 'lucide-react'
import { jobApi, proposalApi, cvApi, type Job, type FitReport } from '../api/axios'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (!min && !max) return null
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'AUD' ? 'A$' : ''
  const fmt = (n: number) => n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `${fmt(min)}+`
  return `Up to ${fmt(max!)}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

const SOURCE_LABELS: Record<string, string> = {
  adzuna:   'Adzuna',
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
}

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  remote:  <Globe  className="w-3 h-3" />,
  onsite:  <WifiOff className="w-3 h-3" />,
  hybrid:  <Wifi   className="w-3 h-3" />,
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ACCEPTED_EXTS = ['.pdf', '.docx']
const MAX_SIZE_MB = 5

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const radius      = 36
  const circumference = 2 * Math.PI * radius
  const offset      = circumference - (score / 100) * circumference
  const color       = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={radius} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="text-center">
        <p className="text-xl font-bold text-slate-100">{score}</p>
        <p className="text-[10px] text-slate-500 font-medium">/ 100</p>
      </div>
    </div>
  )
}

// ── Job Card ──────────────────────────────────────────────────────────────────
function JobCard({ job, isSelected, onClick }: {
  job: Job; isSelected: boolean; onClick: () => void
}) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency)
  const score  = job.matchPercent ?? 0

  return (
    <button
      onClick={onClick}
      className={`w-full text-left glass p-4 transition-all duration-150 group ${
        isSelected
          ? 'border-violet-500/50 bg-violet-500/10'
          : 'hover:bg-white/[0.05] hover:border-white/10'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-snug line-clamp-2 group-hover:text-violet-300 transition-colors">
            {job.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            {job.company}
          </p>
        </div>
        {/* Match badge */}
        {score > 0 && (
          <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
            score >= 70
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
              : score >= 40
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
              : 'bg-slate-500/15 text-slate-400 border border-white/5'
          }`}>
            {score}%
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          {LOCATION_ICONS[job.locationType]}
          {job.location}
        </span>
        {salary && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {salary}
          </span>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {timeAgo(job.postedAt)}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-600 text-[10px]">
          {SOURCE_LABELS[job.source] ?? job.source}
        </span>
      </div>
    </button>
  )
}

// ── Fit Panel ─────────────────────────────────────────────────────────────────
function FitPanel({ job, onClose, onGenerateProposal }: {
  job: Job & { description?: string }
  onClose: () => void
  onGenerateProposal: (job: Job, fit: FitReport) => void
}) {
  const [fit,          setFit]          = useState<FitReport | null>(null)
  const [fitLoading,   setFitLoading]   = useState(false)
  const [fitError,     setFitError]     = useState('')
  const [fullJob,      setFullJob]      = useState<(Job & { description: string }) | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [genSuccess,   setGenSuccess]   = useState(false)

  // Fetch full job details + fit report
  useEffect(() => {
    let cancelled = false
    setFit(null)
    setFitError('')
    setFitLoading(true)
    setFullJob(null)

    Promise.all([
      jobApi.getById(job.id),
      jobApi.getFitReport(job.id),
    ]).then(([jobRes, fitRes]) => {
      if (cancelled) return
      setFullJob(jobRes.data.data.job)
      setFit(fitRes.data.data)
    }).catch((err: unknown) => {
      if (cancelled) return
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Failed to load fit report.'
      setFitError(msg)
    }).finally(() => {
      if (!cancelled) setFitLoading(false)
    })

    return () => { cancelled = true }
  }, [job.id])

  const handleGenerate = async () => {
    if (!fit || !fullJob) return
    setGenerating(true)
    try {
      await proposalApi.generate({
        jobTitle:       fullJob.title,
        jobDescription: fullJob.description,
        jobSource:      fullJob.source,
        fitScore:       fit.score,
        matchingSkills: fit.matchingSkills,
        missingSkills:  fit.missingSkills,
        fitReasoning:   fit.reasoning,
      })
      setGenSuccess(true)
      onGenerateProposal(job, fit)
    } catch {
      setFitError('Failed to queue proposal. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency)

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-start justify-between p-5 border-b border-white/5 flex-shrink-0">
        <div className="min-w-0 pr-4">
          <h2 className="text-base font-bold text-slate-100 leading-snug">{job.title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{job.company} · {job.location}</p>
          {salary && <p className="text-sm text-emerald-400 mt-1 font-medium">{salary}</p>}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {fitLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
            <p className="text-sm text-slate-500">Analysing your fit with AI…</p>
          </div>
        )}

        {fitError && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {fitError}
          </div>
        )}

        {fit && !fitLoading && (
          <>
            {/* Score */}
            <div className="glass p-4 flex items-center gap-5">
              <ScoreRing score={fit.score} />
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Fit Score</p>
                <p className="text-sm text-slate-300 leading-relaxed">{fit.reasoning}</p>
              </div>
            </div>

            {/* Matching skills */}
            {fit.matchingSkills.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  You Have ({fit.matchingSkills.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fit.matchingSkills.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[12px] font-medium text-emerald-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Missing skills */}
            {fit.missingSkills.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-red-500 font-semibold mb-2 flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  Gap Detected ({fit.missingSkills.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fit.missingSkills.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] font-medium text-red-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Job description snippet */}
            {fullJob?.description && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Job Description</p>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-6">
                  {fullJob.description.replace(/<[^>]*>/g, '').substring(0, 600)}…
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-5 border-t border-white/5 flex-shrink-0 space-y-2">
        {genSuccess ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4" />
            Proposal queued! Go to the Generator to view it.
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!fit || fitLoading || generating}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            ) : (
              <><Wand2 className="w-4 h-4" /> Generate Proposal</>
            )}
          </button>
        )}
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost w-full flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          View Original Posting
        </a>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Filter = 'both' | 'remote_only' | 'onsite_only'

export default function JobSearch() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // System states
  const [hasCv,            setHasCv]            = useState<boolean | null>(null)
  const [cvLoading,        setCvLoading]        = useState(true)
  const [preference,       setPreference]       = useState<'both' | 'remote_only' | 'onsite_only'>('both')

  // CV Ingestion / Upload Box states
  const [dragOver,         setDragOver]         = useState(false)
  const [uploadFile,       setUploadFile]       = useState<File | null>(null)
  const [uploadState,      setUploadState]      = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [uploadProgress,   setUploadProgress]   = useState(0)
  const [uploadError,      setUploadError]      = useState('')

  // Show upload widgets dynamically
  const [showUpdateCV,     setShowUpdateCV]     = useState(false)

  // Active filtering skill tags (initialized from database, editable at runtime)
  const [dbSkills,         setDbSkills]         = useState<string[]>([])
  const [activeTags,       setActiveTags]       = useState<string[]>([])
  const [newTagInput,      setNewTagInput]      = useState('')

  // Job results states
  const [jobs,             setJobs]             = useState<Job[]>([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState('')
  const [emptyMsg,         setEmptyMsg]         = useState('')
  const [filter,           setFilter]           = useState<Filter>('both')
  const [selectedJob,      setSelectedJob]      = useState<Job | null>(null)
  const [searchQuery,      setSearchQuery]      = useState('')

  // ── Step 1: Initial Profile & Skills verification ──────────────────────
  const checkProfileState = useCallback(async () => {
    setCvLoading(true)
    try {
      const res = await cvApi.getSkills()
      const { hasPortfolioText, extractedSkills, jobPreference } = res.data.data
      setHasCv(hasPortfolioText)
      setDbSkills(extractedSkills)
      setActiveTags(extractedSkills)
      if (jobPreference) {
        setPreference(jobPreference as 'both' | 'remote_only' | 'onsite_only')
        setFilter(jobPreference as Filter)
      }
    } catch {
      setHasCv(false)
    } finally {
      setCvLoading(false)
    }
  }, [])

  useEffect(() => {
    checkProfileState()
  }, [checkProfileState])

  // ── Step 2: Ingest Jobs based on activeTags ─────────────────────────────
  const fetchJobs = useCallback(async (pref: Filter, tags: string[]) => {
    setLoading(true)
    setError('')
    setEmptyMsg('')
    try {
      const res = await jobApi.search(pref !== 'both' ? pref : undefined, tags)
      const { jobs: fetched, message } = res.data.data
      setJobs(fetched)
      if (message) setEmptyMsg(message)
    } catch {
      setError('Failed to load matching jobs. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Refetch when location filter or skill tags change
  useEffect(() => {
    if (hasCv) {
      fetchJobs(filter, activeTags)
    }
  }, [filter, activeTags, hasCv, fetchJobs])

  // ── CV File Upload Logic ─────────────────────────────────────────────────
  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXTS.some((e) => f.name.toLowerCase().endsWith(e))) {
      return 'Only PDF and DOCX files are accepted.'
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File is too large (${formatBytes(f.size)}). Maximum size is ${MAX_SIZE_MB} MB.`
    }
    return null
  }

  const selectFile = (f: File) => {
    const err = validateFile(f)
    if (err) { setUploadError(err); setUploadState('error'); return }
    setUploadFile(f)
    setUploadState('idle')
    setUploadError('')
    setUploadProgress(0)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) selectFile(f)
  }, [])

  const handleUpload = async () => {
    if (!uploadFile) return
    setUploadState('uploading')
    setUploadProgress(0)
    setUploadError('')

    try {
      await cvApi.updatePreference(preference)
      const res = await cvApi.upload(uploadFile, setUploadProgress)
      setUploadState('success')
      setShowUpdateCV(false)
      setUploadFile(null)

      // Refresh database profile skills and switch view state to search
      const skills = res.data.data.extractedSkills
      setDbSkills(skills)
      setActiveTags(skills)
      setHasCv(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Upload failed. Please try again.'
      setUploadError(msg)
      setUploadState('error')
    }
  }

  // ── Skill Tag Manipulation ────────────────────────────────────────────────
  const removeTag = (tag: string) => {
    const nextTags = activeTags.filter((t) => t !== tag)
    setActiveTags(nextTags)
  }

  const addTag = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTagInput.trim()
    if (trimmed && !activeTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setActiveTags([...activeTags, trimmed])
      setNewTagInput('')
    }
  }

  const resetToDbSkills = () => {
    setActiveTags(dbSkills)
  }

  // Local job title/company keyword search
  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
  })

  // ── Render States ────────────────────────────────────────────────────────

  // Loading profile skills from API
  if (cvLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        <p className="text-sm text-slate-500">Checking profile context…</p>
      </div>
    )
  }

  // VIEW 1: No CV Profile uploaded yet
  if (hasCv === false) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl mx-auto animate-fade-in py-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-violet-950/50">
            <Briefcase className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
            Get Started with <span className="gradient-text">Job Matches</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-md mx-auto">
            Upload your CV or résumé (PDF/DOCX) below. We will analyze your skills and automatically find matching job listings.
          </p>
        </div>

        {/* Location Preference */}
        <div className="glass p-5 mb-6 border border-white/5">
          <p className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-violet-400" />
            Job Location Preference
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'both',        label: '🌐 Both (Remote & On-site)' },
              { value: 'remote_only', label: '🏠 Remote Only' },
              { value: 'onsite_only', label: '🏢 On-site Only' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setPreference(value); setFilter(value as Filter) }}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-150 ${
                  preference === value
                    ? 'bg-violet-600/25 text-violet-300 border-violet-500/40 shadow-lg shadow-violet-950/20'
                    : 'text-slate-400 border-white/5 hover:border-white/10 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload box */}
        <div
          className={`glass border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 mb-6 ${
            dragOver
              ? 'border-violet-500 bg-violet-500/5'
              : uploadFile
              ? 'border-violet-500/50 bg-violet-500/5'
              : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
          }`}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !uploadFile && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])}
          />

          {uploadFile ? (
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-violet-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">{uploadFile.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(uploadFile.size)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setUploadFile(null); setUploadState('idle') }}
                className="ml-2 p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-6 h-6 text-violet-400" />
              </div>
              <p className="text-sm font-semibold text-slate-200 mb-1">
                Drag & drop your CV here
              </p>
              <p className="text-xs text-slate-500 mb-3">or click to browse</p>
              <p className="text-[11px] text-slate-600 font-mono">PDF or DOCX · Max 5 MB</p>
            </>
          )}
        </div>

        {/* In progress bar */}
        {uploadState === 'uploading' && (
          <div className="glass p-5 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              <p className="text-sm text-slate-300 font-medium">
                {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : 'Extracting skills with AI…'}
              </p>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
                style={{ width: `${uploadProgress < 100 ? uploadProgress : 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error box */}
        {uploadState === 'error' && uploadError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 mb-6 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{uploadError}</p>
          </div>
        )}

        {/* CTA upload action */}
        {uploadFile && uploadState !== 'uploading' && (
          <button
            onClick={handleUpload}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 shadow-lg shadow-violet-950/20"
          >
            <Sparkles className="w-4 h-4" />
            Analyze & Build Profile
          </button>
        )}
      </div>
    )
  }

  // VIEW 2: CV Profile exits, show Job matching board
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: Job list & Active Profile widgets ─────────────────── */}
      <div className={`flex flex-col ${selectedJob ? 'hidden lg:flex lg:w-[460px]' : 'w-full'} border-r border-white/5 flex-shrink-0 bg-zinc-950/20`}>

        {/* Header Widget Panel */}
        <div className="p-4 border-b border-white/5 flex-shrink-0 space-y-3">
          
          {/* Quick-Upload CV Widget */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-300">Active Profile</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {dbSkills.length} parsed skills · {filter === 'remote_only' ? 'Remote' : filter === 'onsite_only' ? 'On-site' : 'All Locations'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowUpdateCV(!showUpdateCV)}
              className="px-2.5 py-1 rounded-lg border border-white/10 hover:border-white/20 text-[11px] font-medium text-slate-300 hover:text-slate-100 transition-colors flex items-center justify-center gap-1 flex-shrink-0"
            >
              {showUpdateCV ? <X className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              {showUpdateCV ? 'Cancel' : 'Update CV'}
            </button>
          </div>

          {/* Quick CV Update Dropzone (displays inline below header when active) */}
          {showUpdateCV && (
            <div className="glass p-4 border border-violet-500/20 rounded-xl space-y-3 animate-slide-down">
              <div
                className={`border border-dashed rounded-lg p-4 text-center cursor-pointer ${
                  dragOver ? 'border-violet-500 bg-violet-500/5' : 'border-white/10 hover:border-white/20'
                }`}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !uploadFile && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])}
                />
                {uploadFile ? (
                  <p className="text-xs text-slate-200 truncate">{uploadFile.name}</p>
                ) : (
                  <p className="text-xs text-slate-400">Drag PDF/DOCX here or click to browse</p>
                )}
              </div>

              {uploadState === 'uploading' && (
                <div className="space-y-1">
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400">Uploading: {uploadProgress}%</p>
                </div>
              )}

              {uploadError && (
                <p className="text-[11px] text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {uploadError}
                </p>
              )}

              {uploadFile && uploadState !== 'uploading' && (
                <button
                  onClick={handleUpload}
                  className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-parse &amp; Sync
                </button>
              )}
            </div>
          )}

          {/* Tag Filter Widget (Direct Tag Editing) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Matching Tags</p>
              {JSON.stringify(activeTags) !== JSON.stringify(dbSkills) && (
                <button
                  onClick={resetToDbSkills}
                  className="text-[10px] text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to CV
                </button>
              )}
            </div>

            {/* Chips scroll container */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {activeTags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[11px] font-medium text-violet-300"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="p-0.5 rounded hover:bg-violet-500/20 text-violet-400 hover:text-violet-200 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}

              {/* Add custom tag form */}
              <form onSubmit={addTag} className="inline-flex items-center">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="+ Add skill"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    className="bg-transparent border border-white/10 rounded-lg px-2 py-0.5 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 w-24 transition-colors"
                  />
                  {newTagInput && (
                    <button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-violet-400 hover:text-violet-300">
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Job Search header / search keyword query */}
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Filter matching jobs by title/company…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
            
            <button
              onClick={() => fetchJobs(filter, activeTags)}
              disabled={loading}
              className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-slate-400 hover:text-slate-200 rounded-xl transition-colors disabled:opacity-50"
              aria-label="Refresh matching jobs list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Location Filters */}
          <div className="flex gap-1.5">
            {([
              { value: 'both',        label: 'All Locations', icon: <Globe   className="w-3 h-3" /> },
              { value: 'remote_only', label: 'Remote Only',   icon: <Wifi    className="w-3 h-3" /> },
              { value: 'onsite_only', label: 'On-site Only',  icon: <WifiOff className="w-3 h-3" /> },
            ] as const).map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                  filter === value
                    ? 'bg-violet-600/20 text-violet-300 border-violet-500/25 shadow-sm'
                    : 'text-slate-500 border-white/5 hover:border-white/10 hover:text-slate-300'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {/* Matching Jobs List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
              <p className="text-xs text-slate-500">Finding matches based on tags…</p>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="flex items-start gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            </div>
          ) : emptyMsg ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-violet-400" />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{emptyMsg}</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center p-6">
              <Search className="w-7 h-7 text-slate-600" />
              <p className="text-xs text-slate-500">No jobs match your search queries.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isSelected={selectedJob?.id === job.id}
                  onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Match Count Footer */}
        {!loading && filteredJobs.length > 0 && (
          <div className="px-4 py-2 border-t border-white/5 flex-shrink-0 bg-zinc-950/40">
            <p className="text-[10px] text-slate-600 font-medium">
              {filteredJobs.length} matching job{filteredJobs.length !== 1 ? 's' : ''} listed
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel: Fit report side-view panel ─────────────────────── */}
      {selectedJob && (
        <div className="flex-1 min-w-0 bg-zinc-950/40">
          <FitPanel
            job={selectedJob}
            onClose={() => setSelectedJob(null)}
            onGenerateProposal={(_job, _fit) => {
              // proposal generated callback
            }}
          />
        </div>
      )}

      {/* Empty panel screen placeholder (desktop views) */}
      {!selectedJob && (
        <div className="hidden lg:flex flex-1 items-center justify-center flex-col gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-lg">
            <ChevronRight className="w-6 h-6 text-violet-400" />
          </div>
          <p className="text-sm font-semibold text-slate-300">No Job Selected</p>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Select any listing from the dashboard to run an AI Fit-Gap analysis and prepare your proposal.
          </p>
        </div>
      )}
    </div>
  )
}
