'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Track = {
  track: number
  name: string
  instrument: string
  program: number
  channel: number
  is_drum: boolean
  note_count: number
}

type Selection = {
  track: number
  name: string
  channel: number
  program: number
  is_drum: boolean
  position: 'front' | 'center' | 'rear'
  subwoofer: boolean
}

export default function TracksPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selections, setSelections] = useState<Selection[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/midi/${id}/tracks`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTracks(data.tracks)
        setSelections(
          data.tracks.map((t: Track) => ({
            track: t.track,
            name: t.name,
            channel: t.channel,
            program: t.program,
            is_drum: t.is_drum,
            position: 'center' as const,
            subwoofer: t.is_drum,
          }))
        )
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const setPosition = (index: number, position: 'front' | 'center' | 'rear') => {
    setSelections((prev) => prev.map((s, i) => (i === index ? { ...s, position } : s)))
  }

  const toggleSubwoofer = (index: number) => {
    setSelections((prev) => prev.map((s, i) => (i === index ? { ...s, subwoofer: !s.subwoofer } : s)))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/midi/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al iniciar proceso')
      router.push(`/midi/${id}/process`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="p-4 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">Instrumentos / Pistas</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
        Seleccioná la posición de cada pista y marcá las que deben ir al subwoofer
      </p>

      <div className="space-y-3 flex-1">
        {tracks.map((track, i) => {
          const sel = selections[i]
          return (
            <div
              key={i}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-medium">{track.name}</span>
                  <span className="text-zinc-400 text-sm ml-2">
                    {track.instrument}
                  </span>
                  {track.is_drum && (
                    <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                      Batería
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">
                  CH {track.channel} · {track.note_count} notas
                </span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-zinc-500">Posición:</span>
                {(['front', 'center', 'rear'] as const).map((pos) => (
                  <label key={pos} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`pos-${i}`}
                      checked={sel?.position === pos}
                      onChange={() => setPosition(i, pos)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm capitalize">
                      {pos === 'front' ? 'Adelante' : pos === 'center' ? 'Central' : 'Atrás'}
                    </span>
                  </label>
                ))}

                <label className="flex items-center gap-1.5 cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={sel?.subwoofer || false}
                    onChange={() => toggleSubwoofer(i)}
                    className="accent-blue-500"
                  />
                  <span className="text-sm">Subwoofer</span>
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Iniciando...' : 'Comenzar procesado'}
        </button>
      </div>
    </div>
  )
}
