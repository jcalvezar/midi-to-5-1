import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; format: string }> }
) {
  const { id, format } = await params

  if (format !== 'dts' && format !== 'ac3') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }

  const uploadDir = path.join(process.cwd(), 'uploads', id)
  const metaPath = path.join(uploadDir, 'meta.json')
  const baseName = existsSync(metaPath)
    ? (() => { try { return JSON.parse(readFileSync(metaPath, 'utf-8')).baseName } catch { return 'output' } })()
    : 'output'

  const ext = format === 'dts' ? 'dts' : 'ac3'
  const serverFilename = `${baseName}.${ext}`
  const downloadFilename = serverFilename

  const filepath = path.join(uploadDir, 'output', 'final', serverFilename)

  if (!existsSync(filepath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const bytes = await readFile(filepath)
  const contentType = format === 'dts' ? 'audio/vnd.dts' : 'audio/ac3'

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Content-Length': String(bytes.length),
    },
  })
}
