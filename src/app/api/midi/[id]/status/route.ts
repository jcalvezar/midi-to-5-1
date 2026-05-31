import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const uploadDir = path.join(process.cwd(), 'uploads', id)
  const metaPath = path.join(uploadDir, 'meta.json')
  const baseName = existsSync(metaPath)
    ? (() => { try { return JSON.parse(readFileSync(metaPath, 'utf-8')).baseName } catch { return 'output' } })()
    : 'output'

  const statusFile = path.join(uploadDir, 'output', 'status.json')

  if (!existsSync(statusFile)) {
    return NextResponse.json({ status: 'pending', step: 0, total: 0, label: 'Starting...' })
  }

  let status: Record<string, unknown>
  try {
    status = JSON.parse(readFileSync(statusFile, 'utf-8'))
  } catch {
    return NextResponse.json({ status: 'pending', step: 0, total: 0, label: 'Starting...' })
  }

  if (status.status === 'completed') {
    const finalDir = path.join(uploadDir, 'output', 'final')
    status.files = {
      dts: existsSync(path.join(finalDir, `${baseName}.dts`)) ? `/api/midi/${id}/download/dts` : null,
      ac3: existsSync(path.join(finalDir, `${baseName}.ac3`)) ? `/api/midi/${id}/download/ac3` : null,
    }
  }

  return NextResponse.json(status)
}
