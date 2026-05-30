import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; format: string }> }
) {
  const { id, format } = await params

  const filename = format === 'dts' ? 'output.dts' : format === 'ac3' ? 'output.ac3' : null
  if (!filename) {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }

  const filepath = path.join(process.cwd(), 'uploads', id, 'output', 'final', filename)

  if (!existsSync(filepath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const bytes = await readFile(filepath)
  const contentType = format === 'dts' ? 'audio/vnd.dts' : 'audio/ac3'

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.length),
    },
  })
}
