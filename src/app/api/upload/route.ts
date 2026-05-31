import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      return NextResponse.json({ error: 'File must be a MIDI file (.mid or .midi)' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const jobDir = path.join(UPLOAD_DIR, id)
    await mkdir(jobDir, { recursive: true })

    const ext = path.extname(file.name)
    const filename = `input${ext}`
    const filepath = path.join(jobDir, filename)

    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    const baseName = path.parse(file.name).name
    await writeFile(
      path.join(jobDir, 'meta.json'),
      JSON.stringify({ originalName: file.name, baseName })
    )

    return NextResponse.json({
      id,
      filename: file.name,
      filepath,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
