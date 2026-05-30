'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

type Step = {
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
}

type ProcessStatus = {
  status: string
  step: number
  total: number
  label: string
  error?: string
  steps?: Step[]
  files?: { dts: string | null; ac3: string | null }
}

const BAR_COLORS: Record<string, string> = {
  pending: 'bg-zinc-700',
  processing: 'bg-violet-500',
  completed: 'bg-green-500',
  error: 'bg-red-500',
}

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  processing: '◉',
  completed: '●',
  error: '✕',
}

export default function ProcessPage() {
  const params = useParams()
  const id = params.id as string

  const [data, setData] = useState<ProcessStatus>({
    status: 'pending', step: 0, total: 0, label: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  const [downloads, setDownloads] = useState<{ dts: string | null; ac3: string | null }>({
    dts: null, ac3: null,
  })
  const lastUpdate = useRef(0)
  const doneRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(async () => {
      if (doneRef.current) return
      try {
        const res = await fetch(`/api/midi/${id}/status`)
        const d: ProcessStatus = await res.json()
        setData(d)
        lastUpdate.current = Date.now()
        setStuck(false)
        if (d.files) setDownloads(d.files)
        if (d.status === 'completed' || d.status === 'error') {
          doneRef.current = true
          clearInterval(interval)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
        clearInterval(interval)
      }
    }, 1000)

    const stuckTimer = setInterval(() => {
      if (Date.now() - lastUpdate.current > 30000) {
        setStuck(true)
      }
    }, 5000)

    return () => { clearInterval(interval); clearInterval(stuckTimer) }
  }, [id])

  const steps = data.steps ?? []

  return (
    <div className="flex flex-col flex-1 items-center p-8 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Processing MIDI</h1>

      {stuck && (
        <div className="w-full p-3 mb-4 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg text-sm text-center">
          The process seems stuck. Check the server console for errors.
        </div>
      )}

      {steps.length > 0 && (
        <div className="w-full space-y-2 mb-8">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`w-5 text-center text-sm ${
                step.status === 'processing' ? 'text-violet-400' :
                step.status === 'completed' ? 'text-green-400' :
                step.status === 'error' ? 'text-red-400' :
                'text-zinc-600'
              }`}>
                {STATUS_ICON[step.status] || '○'}
              </span>
              <div className="flex-1 h-3 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[step.status] || BAR_COLORS.pending}`}
                  style={{ width: step.status === 'processing' ? '60%' : step.status === 'completed' ? '100%' : step.status === 'error' ? '100%' : '0%' }}
                />
              </div>
              <span className={`text-sm w-64 truncate ${
                step.status === 'processing' ? 'text-violet-300' :
                step.status === 'completed' ? 'text-green-300' :
                step.status === 'error' ? 'text-red-300' :
                'text-zinc-500'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.status === 'processing' && steps.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Processing... this may take several minutes</p>
        </div>
      )}

      {data.status === 'error' && (
        <div className="w-full p-4 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {data.error || 'Unknown error'}
        </div>
      )}

      {data.status === 'completed' && (
        <div className="w-full space-y-4">
          <div className="p-4 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-lg text-sm text-center">
            Processing complete!
          </div>

          <div className="flex gap-3 justify-center">
            {downloads.dts && (
              <a href={downloads.dts} download
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-black rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download DTS
              </a>
            )}
            {downloads.ac3 && (
              <a href={downloads.ac3} download
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-black rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download AC3
              </a>
            )}
          </div>

          {!downloads.dts && !downloads.ac3 && (
            <p className="text-zinc-400 text-sm text-center">No output files found</p>
          )}
        </div>
      )}

      {error && (
        <div className="w-full p-4 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg text-sm mt-4">
          {error}
        </div>
      )}
    </div>
  )
}
