'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export default function UploadPage() {
  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      setError('Solo archivos MIDI (.mid, .midi)')
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al subir')
      router.push(`/midi/${data.id}/tracks`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir archivo')
      setUploading(false)
    }
  }, [router])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const openFilePicker = () => {
    inputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Midiar</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Subí un archivo MIDI para convertirlo a DTS/AC3 5.1
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFilePicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFilePicker() }}
        role="button"
        tabIndex={0}
        className={`w-full max-w-md border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-500">Subiendo archivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-12 h-12 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-zinc-500 dark:text-zinc-400">
              Arrastrá un archivo MIDI acá o hacé clic para seleccionar
            </p>
            <p className="text-xs text-zinc-400">.mid o .midi</p>
          </div>
        )}
      </div>

      <button
        onClick={openFilePicker}
        className="mt-4 px-6 py-2 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-black rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
      >
        Seleccionar archivo MIDI
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-lg text-sm max-w-md w-full text-center">
          {error}
        </div>
      )}
    </div>
  )
}
