import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { existsSync } from 'fs'

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

const runningProcesses = new Map<string, { child: ReturnType<typeof spawn>; startedAt: number }>()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { selections, soundfont } = body as { selections: Selection[]; soundfont?: string }

  if (!selections || !Array.isArray(selections) || selections.length === 0) {
    return NextResponse.json({ error: 'No track selections provided' }, { status: 400 })
  }

  const uploadDir = path.join(process.cwd(), 'uploads', id)
  const midiFiles = ['input.mid', 'input.midi']
    .map((f) => path.join(uploadDir, f))
    .filter(existsSync)

  if (midiFiles.length === 0) {
    return NextResponse.json({ error: 'MIDI file not found' }, { status: 404 })
  }

  const outputDir = path.join(uploadDir, 'output')
  const scriptPath = path.join(process.cwd(), 'scripts', 'process_midi.py')
  const selectionsJson = JSON.stringify(selections)
  const sfArg = soundfont || ''

  const child = spawn('python3', [scriptPath, midiFiles[0], outputDir, selectionsJson, sfArg], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600000,
  })

  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString()
    const lines = text.trim().split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.type === 'error') {
          console.error(`[process ${id}] Error:`, parsed.message)
        } else if (parsed.type === 'log') {
          console.log(`[process ${id}] ${parsed.message}`)
        } else if (parsed.type === 'progress') {
          console.log(`[process ${id}] progress: step ${parsed.step}/${parsed.total} - ${parsed.label}`)
        }
      } catch {
        console.log(`[process ${id}] RAW: ${trimmed.slice(0, 200)}`)
      }
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    console.error(`[process ${id}] stderr:`, data.toString())
  })

  child.on('error', (err) => {
    console.error(`[process ${id}] spawn error:`, err)
  })

  child.on('exit', (code) => {
    console.log(`[process ${id}] exited with code ${code}`)
    runningProcesses.delete(id)
  })

  runningProcesses.set(id, { child, startedAt: Date.now() })

  return NextResponse.json({ id, status: 'started' })
}
