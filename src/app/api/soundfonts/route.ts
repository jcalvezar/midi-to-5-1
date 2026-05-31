import { NextResponse } from 'next/server'
import { mkdir, readdir, writeFile } from 'fs/promises'
import path from 'path'

const SF_DIR = path.join(process.cwd(), 'uploads', 'soundfonts')

export async function GET() {
  try {
    await mkdir(SF_DIR, { recursive: true })
    const files = await readdir(SF_DIR)
    const sf2s = files
      .filter((f) => f.endsWith('.sf2'))
      .map((f) => ({ name: f, path: path.join(SF_DIR, f) }))
    return NextResponse.json({ soundfonts: sf2s })
  } catch {
    return NextResponse.json({ soundfonts: [] })
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.sf2')) {
      return NextResponse.json({ error: 'File must be a SoundFont (.sf2)' }, { status: 400 })
    }

    const filepath = path.join(SF_DIR, file.name)
    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    return NextResponse.json({ name: file.name, path: filepath })
  } catch (error) {
    console.error('SoundFont upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
