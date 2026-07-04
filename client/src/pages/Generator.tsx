import { useState, useEffect, useRef, type FormEvent } from 'react'
import {
  Wand2, Send, Copy, CheckCheck, AlertCircle, Clock,
  RefreshCcw, ChevronDown, ChevronUp, User as UserIcon, Save, CheckCircle2,
} from 'lucide-react'
import { proposalApi, userApi } from '../api/axios'

type GenStatus = 'idle' | 'submitting' | 'polling' | 'completed' | 'failed'

const POLL_INTERVAL_MS = 3000

const statusMeta: Record<GenStatus, { label: string; color: string }> = {
  idle:       { label: 'Ready',       color: 'text-slate-400'  },
  submitting: { label: 'Submitting…', color: 'text-violet-400' },
  polling:    { label: 'Generating…', color: 'text-amber-400'  },
  completed:  { label: 'Completed',   color: 'text-emerald-400'},
  failed:     { label: 'Failed',      color: 'text-red-400'    },
}

export default function Generator() {
  // ── Form state ───────────────────────────────────────────────────────────
  const [jobTitle,       setJobTitle]       = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobSource,      setJobSource]      = useState('')
  const [showAdvanced,   setShowAdvanced]   = useState(false)

  // ── Pipeline state ───────────────────────────────────────────────────────
  const [genStatus,    setGenStatus]    = useState<GenStatus>('idle')
  const [proposalId,   setProposalId]   = useState<string | null>(null)
  const [generatedText, setGeneratedText] = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [pollCount,    setPollCount]    = useState(0)
  const [copied,       setCopied]       = useState(false)

  // ── Portfolio state ───────────────────────────────────────────────────────
  const [portfolio,          setPortfolio]          = useState('')
  const [portfolioLoading,   setPortfolioLoading]   = useState(true)
  const [portfolioSaving,     setPortfolioSaving]     = useState(false)
  const [portfolioSaveStatus, setPortfolioSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPortfolioOpen,     setIsPortfolioOpen]     = useState(false)

  // ── Refinement state ──────────────────────────────────────────────────────
  const [refinementInput, setRefinementInput] = useState('')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch portfolio context on mount ───────────────────────────────────────
  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await userApi.getProfile()
        setPortfolio(res.data.data.user.portfolioText ?? '')
      } catch {
        // non-fatal
      } finally {
        setPortfolioLoading(false)
      }
    }
    fetchPortfolio()
  }, [])

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // ── Polling effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (genStatus !== 'polling' || !proposalId) return

    const poll = async () => {
      try {
        setPollCount((c) => c + 1)
        const res = await proposalApi.getById(proposalId)
        const proposal = res.data.data.proposal

        if (proposal.status === 'COMPLETED') {
          setGeneratedText(proposal.generatedText ?? '')
          setGenStatus('completed')
          if (intervalRef.current) clearInterval(intervalRef.current)
        } else if (proposal.status === 'FAILED') {
          setError('The AI worker failed to generate a proposal. Please try again.')
          setGenStatus('failed')
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
        // PENDING → keep polling
      } catch {
        setError('Lost connection while polling for results.')
        setGenStatus('failed')
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    poll() // immediate first poll

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [genStatus, proposalId])

  // ── Save Portfolio ───────────────────────────────────────────────────────
  const handleSavePortfolio = async () => {
    setPortfolioSaving(true)
    setPortfolioSaveStatus('idle')
    try {
      await userApi.updateProfile(portfolio)
      setPortfolioSaveStatus('saved')
      setTimeout(() => setPortfolioSaveStatus('idle'), 3000)
    } catch {
      setPortfolioSaveStatus('error')
    } finally {
      setPortfolioSaving(false)
    }
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setGeneratedText(null)
    setProposalId(null)
    setPollCount(0)
    setGenStatus('submitting')

    try {
      // 1. Validate portfolio is not empty
      if (!portfolio.trim()) {
        throw new Error('Your portfolio is empty. Please enter your portfolio context first.')
      }
      
      // Auto-save portfolio
      setPortfolioSaving(true)
      await userApi.updateProfile(portfolio)
      setPortfolioSaveStatus('saved')
      setPortfolioSaving(false)
      setTimeout(() => setPortfolioSaveStatus('idle'), 3000)

      // 2. Generate proposal
      const res = await proposalApi.generate({
        jobTitle:       jobTitle.trim() || undefined,
        jobDescription: jobDescription.trim(),
        jobSource:      jobSource.trim() || undefined,
      })
      setProposalId(res.data.data.proposalId)
      setGenStatus('polling')
    } catch (err: unknown) {
      setPortfolioSaving(false)
      const msg =
        (err as { message?: string })?.message ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Submission failed. Make sure the API server is running.'
      setError(msg)
      setGenStatus('failed')
    }
  }

  // ── Refinement handlers ──────────────────────────────────────────────────
  const handleRefine = async (instruction: string) => {
    if (!proposalId) return
    setError(null)
    setGenStatus('submitting')
    try {
      await proposalApi.refine(proposalId, instruction)
      setGenStatus('polling')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Refinement failed. Please try again.'
      setError(msg)
      setGenStatus('failed')
    }
  }

  const handleCustomRefine = (e: FormEvent) => {
    e.preventDefault()
    if (!refinementInput.trim()) return
    handleRefine(refinementInput.trim())
    setRefinementInput('')
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!generatedText) return
    await navigator.clipboard.writeText(generatedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const isRunning = genStatus === 'submitting' || genStatus === 'polling'
  const charCount = jobDescription.length

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-100">Proposal Generator</h1>
        </div>
        <p className="text-slate-400 text-sm ml-12">
          Paste a job description and get a tailored, AI-written proposal in seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Input column ─────────────────────────────────────────────── */}
        <div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Job description */}
            <div className="glass p-5">
              <label htmlFor="job-description" className="label">
                Job Description <span className="text-red-400">*</span>
              </label>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job description here…&#10;&#10;e.g. We need an experienced React developer to build a customer dashboard for our SaaS product. The ideal candidate has 3+ years with React, TypeScript, and REST APIs…"
                required
                minLength={50}
                maxLength={20000}
                className="input resize-none min-h-[220px] leading-relaxed mt-1"
                disabled={isRunning}
              />
              <div className="flex justify-between mt-1.5">
                <p className={`text-xs ${charCount < 50 ? 'text-amber-400' : 'text-slate-600'}`}>
                  {charCount < 50 ? `${50 - charCount} more chars needed` : `${charCount} / 20,000`}
                </p>
              </div>
            </div>

            {/* My Portfolio Context (collapsible) */}
            <div className="glass overflow-hidden">
              <button
                type="button"
                onClick={() => setIsPortfolioOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-indigo-400" />
                  My Portfolio Context
                </span>
                {isPortfolioOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isPortfolioOpen && (
                <div className="px-5 pb-5 space-y-3 border-t border-white/5 pt-3">
                  <p className="text-[11px] text-slate-500">
                    Describe your skills, experience, and wins. The AI uses this to personalize the proposal.
                  </p>
                  {portfolioLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <textarea
                      id="portfolio-textarea"
                      value={portfolio}
                      onChange={(e) => setPortfolio(e.target.value)}
                      placeholder="e.g. Full-stack developer with 5 years experience in React and Node.js. Built 3 SaaS products..."
                      className="input resize-none min-h-[150px] leading-relaxed text-xs"
                      maxLength={10000}
                      disabled={isRunning}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">
                      {portfolio.length.toLocaleString()}/10,000
                    </span>
                    <button
                      type="button"
                      onClick={handleSavePortfolio}
                      disabled={portfolioSaving || portfolioLoading || isRunning}
                      className={`btn-primary px-3 py-1.5 text-xs ${
                        portfolioSaveStatus === 'saved'
                          ? '!from-emerald-600 !to-teal-600'
                          : portfolioSaveStatus === 'error'
                          ? '!from-red-600 !to-red-700'
                          : ''
                      }`}
                    >
                      {portfolioSaving ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : portfolioSaveStatus === 'saved' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {portfolioSaving ? 'Saving…' : portfolioSaveStatus === 'saved' ? 'Saved!' : 'Save Portfolio'}
                    </button>
                  </div>
                  {portfolioSaveStatus === 'error' && (
                    <p className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Failed to save.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Advanced (collapsible) */}
            <div className="glass overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>Advanced options</span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="px-5 pb-5 space-y-3 border-t border-white/5">
                  <div className="pt-3">
                    <label htmlFor="job-title" className="label">Job Title</label>
                    <input
                      id="job-title"
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior React Developer"
                      className="input"
                      disabled={isRunning}
                    />
                  </div>
                  <div>
                    <label htmlFor="job-source" className="label">Source Platform</label>
                    <input
                      id="job-source"
                      type="text"
                      value={jobSource}
                      onChange={(e) => setJobSource(e.target.value)}
                      placeholder="e.g. Upwork, LinkedIn, direct"
                      className="input"
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              id="generate-proposal-btn"
              disabled={isRunning || charCount < 50}
              className="btn-primary w-full justify-center py-3.5 text-base"
            >
              {genStatus === 'submitting' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Generate Proposal
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── Output column ────────────────────────────────────────────── */}
        <div>
          <div className="glass p-5 min-h-[420px] flex flex-col">
            {/* Output header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Generated Proposal</h2>
              {genStatus !== 'idle' && (
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <span className="flex items-center gap-1.5 text-xs text-amber-400">
                      <Clock className="w-3 h-3" />
                      Poll #{pollCount}
                    </span>
                  )}
                  <span className={`text-xs font-semibold ${statusMeta[genStatus].color}`}>
                    {statusMeta[genStatus].label}
                  </span>
                </div>
              )}
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col">
              {genStatus === 'idle' && (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                    <Wand2 className="w-8 h-8 text-violet-400/50" />
                  </div>
                  <p className="text-slate-500 text-sm max-w-xs">
                    Fill in the job description and click <strong className="text-slate-400">Generate Proposal</strong> to get started.
                  </p>
                </div>
              )}

              {isRunning && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  {/* Animated AI thinking indicator */}
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                      <Wand2 className="w-8 h-8 text-violet-400 animate-pulse" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-violet-500/10 animate-ping" />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-200 font-medium text-sm">
                      {genStatus === 'submitting' ? 'Queuing your request…' : 'AI is crafting your proposal…'}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {genStatus === 'polling'
                        ? `Checking every ${POLL_INTERVAL_MS / 1000}s · attempt ${pollCount}`
                        : 'Almost there…'}
                    </p>
                  </div>
                  {/* Progress dots */}
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {genStatus === 'failed' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="flex items-center gap-2 text-red-400 bg-red-500/10 px-4 py-3 rounded-xl text-sm text-center">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error ?? 'Generation failed.'}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setGenStatus('idle'); setError(null) }}
                    className="btn-ghost"
                  >
                    <RefreshCcw className="w-4 h-4" /> Try Again
                  </button>
                </div>
              )}

              {genStatus === 'completed' && generatedText && (
                <div className="flex-1 flex flex-col gap-3 animate-fade-in">
                  <div className="flex-1 relative">
                    <textarea
                      id="generated-proposal-output"
                      value={generatedText}
                      readOnly
                      className="input w-full h-full min-h-[280px] resize-none leading-relaxed text-slate-200 bg-emerald-500/5 border-emerald-500/20"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      id="copy-proposal-btn"
                      className={`btn-primary flex-1 justify-center ${
                        copied ? '!from-emerald-600 !to-teal-600' : ''
                      }`}
                    >
                      {copied ? (
                        <><CheckCheck className="w-4 h-4" /> Copied!</>
                      ) : (
                        <><Copy className="w-4 h-4" /> Copy Proposal</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setGenStatus('idle'); setGeneratedText(null); setProposalId(null) }}
                      className="btn-ghost px-3"
                      aria-label="Generate another"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Refinement Options */}
                  <div className="border-t border-white/5 pt-4 mt-2">
                    <p className="text-xs font-semibold text-slate-300 mb-2">Refine this proposal</p>
                    
                    {/* Preset buttons */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {[
                        { label: 'Make it more professional', instruction: 'Make the tone more professional, formal, and authoritative.' },
                        { label: 'Make it shorter/concise', instruction: 'Make it significantly shorter, more direct, and concise (under 200 words).' },
                        { label: 'Make it more enthusiastic', instruction: 'Make the tone more enthusiastic, friendly, and highly engaging.' },
                        { label: 'Highlight tech stack details', instruction: 'Highlight the technical stacks and detailed software engineering aspects more prominently.' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          disabled={isRunning}
                          onClick={() => handleRefine(preset.instruction)}
                          className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-white/10 hover:border-white/20 transition-all font-medium"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom instruction form */}
                    <form onSubmit={handleCustomRefine} className="flex gap-2">
                      <input
                        type="text"
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        placeholder="e.g. Focus more on my experience with React Native..."
                        disabled={isRunning}
                        className="input text-xs h-9 py-1 flex-1 bg-white/[0.03] border-white/10 text-slate-200"
                      />
                      <button
                        type="submit"
                        disabled={isRunning || !refinementInput.trim()}
                        className="btn-primary py-1 px-4 text-xs h-9"
                      >
                        Refine
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
