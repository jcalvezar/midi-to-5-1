import { NextResponse } from 'next/server'
import { existsSync, readdirSync } from 'fs'
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
  const finalDir = path.join(uploadDir, 'output', 'final')

  if (!existsSync(finalDir)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const ext = format === 'dts' ? 'dts' : 'ac3'
  const files = readdirSync(finalDir)
  const match = files.find((f) => f.endsWith(`.${ext}`))

  if (!match) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const filepath = path.join(finalDir, match)
  const bytes = await readFile(filepath)
  const contentType = format === 'dts' ? 'audio/vnd.dts' : 'audio/ac3'

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${match}"`,
      'Content-Length': String(bytes.length),
    },
  })
}
