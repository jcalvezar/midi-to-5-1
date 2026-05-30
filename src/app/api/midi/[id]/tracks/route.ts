import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const jobDir = path.join(UPLOAD_DIR, id)

  if (!existsSync(jobDir)) {
    return NextResponse.json({ error: 'MIDI not found' }, { status: 404 })
  }

  const midiFiles = ['input.mid', 'input.midi'].map(f => path.join(jobDir, f)).filter(existsSync)
  if (midiFiles.length === 0) {
    return NextResponse.json({ error: 'MIDI file not found' }, { status: 404 })
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'parse_midi.py')
  const output = execSync(`python3 "${scriptPath}" "${midiFiles[0]}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
  const data = JSON.parse(output)

  if (data.error) {
    return NextResponse.json({ error: data.error }, { status: 500 })
  }

  return NextResponse.json(data)
}
