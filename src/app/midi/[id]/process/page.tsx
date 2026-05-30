'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  error: 'Error',
}

export default function ProcessPage() {
  const params = useParams()
  const id = params.id as string

  type ProcessStatus = {
    status: string
    step: number
    total: number
    label: string
    error?: string
    files?: { dts: string | null; ac3: string | null }
  }

  const [status, setStatus] = useState<ProcessStatus>({ status: 'pending', step: 0, total: 0, label: '' })
  const [error, setError] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<{ dts: string | null; ac3: string | null }>({ dts: null, ac3: null })

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/midi/${id}/status`)
        const data = await res.json()

        if (data.error) throw new Error(data.error)

        setStatus(data)

        if (data.files) {
          setDownloads(data.files)
        }

        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(interval)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [id])

  const totalSteps = status.total || 1
  const progressPct = status.status === 'completed' ? 100 : Math.round((status.step / totalSteps) * 100)

  return (
    <div className="flex flex-col flex-1 items-center p-8 max-w-lg mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Processing MIDI</h1>

      <div className="w-full mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-zinc-500">
            {status.label || STATUS_LABELS[status.status] || '...'}
          </span>
          <span className="text-zinc-400">
            {status.status === 'completed'
              ? '100%'
              : `${status.step} / ${status.total}`}
          </span>
        </div>

        <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status.status === 'error'
                ? 'bg-red-500'
                : status.status === 'completed'
                  ? 'bg-green-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {status.status === 'processing' && (
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Processing... this may take several minutes</p>
        </div>
      )}

      {status.status === 'error' && (
        <div className="w-full p-4 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {status.error || 'Unknown error'}
        </div>
      )}

      {status.status === 'completed' && (
        <div className="w-full space-y-4">
          <div className="p-4 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-lg text-sm text-center">
            Processing complete!
          </div>

          <div className="flex gap-3 justify-center">
            {downloads.dts && (
              <a
                href={downloads.dts}
                download
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-black rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download DTS
              </a>
            )}
            {downloads.ac3 && (
              <a
                href={downloads.ac3}
                download
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-black rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download AC3
              </a>
            )}
          </div>

          {!downloads.dts && !downloads.ac3 && (
            <p className="text-zinc-400 text-sm text-center">
              No output files found
            </p>
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
