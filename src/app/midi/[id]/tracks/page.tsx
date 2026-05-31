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
  volume: number
}

type SoundFont = {
  name: string
  path: string
}

export default function TracksPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selections, setSelections] = useState<Selection[]>([])
  const [soundfonts, setSoundfonts] = useState<SoundFont[]>([])
  const [selectedSf, setSelectedSf] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sfUploading, setSfUploading] = useState(false)

  const loadSoundfonts = () =>
    fetch('/api/soundfonts')
      .then((r) => r.json())
      .then((d) => setSoundfonts(d.soundfonts || []))

  useEffect(() => {
    Promise.all([
      fetch(`/api/midi/${id}/tracks`).then((r) => r.json()),
      fetch(`/api/midi/${id}/selections`).then((r) => r.json()),
      loadSoundfonts(),
    ])
      .then(([trackData, savedSel]) => {
        if (trackData.error) throw new Error(trackData.error)
        setTracks(trackData.tracks)
        if (savedSel.selections) {
          setSelections(savedSel.selections)
          if (savedSel.soundfont) setSelectedSf(savedSel.soundfont)
        } else {
          setSelections(
            trackData.tracks.map((t: Track) => ({
              track: t.track,
              name: t.name,
              channel: t.channel,
              program: t.program,
              is_drum: t.is_drum,
              position: 'center' as const,
              subwoofer: t.is_drum,
              volume: 100,
            }))
          )
        }
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

  const setVolume = (index: number, volume: number) => {
    setSelections((prev) => prev.map((s, i) => (i === index ? { ...s, volume } : s)))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/midi/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections, soundfont: selectedSf || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start processing')
      router.push(`/midi/${id}/process`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
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
      <h1 className="text-2xl font-bold mb-1">Instruments / Tracks</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
        Select each track&apos;s position and check those that should go to the subwoofer
      </p>

      <div className="mb-6 p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-3">
        <label className="flex items-center gap-3">
          <span className="text-sm font-medium">SoundFont:</span>
          <select
            value={selectedSf}
            onChange={(e) => setSelectedSf(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
          >
            <option value="">Default (Musyng Kite)</option>
            {soundfonts.map((sf) => (
              <option key={sf.name} value={sf.path}>{sf.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".sf2"
            disabled={sfUploading}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setSfUploading(true)
              const fd = new FormData()
              fd.append('file', file)
              await fetch('/api/soundfonts', { method: 'POST', body: fd })
              await loadSoundfonts()
              setSfUploading(false)
              e.target.value = ''
            }}
            className="text-sm text-zinc-500 file:mr-2 file:px-3 file:py-1 file:text-sm file:border file:border-zinc-300 dark:file:border-zinc-700 file:rounded-lg file:bg-white dark:file:bg-zinc-900 file:cursor-pointer"
          />
          {sfUploading && <span className="text-sm text-zinc-400">Uploading...</span>}
        </div>
      </div>

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
                      Drums
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">
                  CH {track.channel} · {track.note_count} notes
                </span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-zinc-500">Position:</span>
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
                      {pos === 'front' ? 'Front' : pos === 'center' ? 'Center' : 'Rear'}
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

                <label className="flex items-center gap-2 ml-4">
                  <span className="text-sm text-zinc-500 w-11">Vol:</span>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    value={sel?.volume ?? 100}
                    onChange={(e) => setVolume(i, Number(e.target.value))}
                    className="w-20 accent-blue-500"
                  />
                  <span className="text-xs text-zinc-400 w-8">{sel?.volume ?? 100}%</span>
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
          {submitting ? 'Starting...' : 'Start processing'}
        </button>
      </div>
    </div>
  )
}
