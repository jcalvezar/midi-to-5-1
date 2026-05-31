import { NextResponse } from 'next/server'
import { readdirSync, readFileSync, existsSync } from 'fs'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const uploadDir = path.join(process.cwd(), 'uploads', id)
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
    let dtsPath: string | null = null
    let ac3Path: string | null = null
    if (existsSync(finalDir)) {
      const files = readdirSync(finalDir)
      for (const f of files) {
        if (f.endsWith('.dts')) dtsPath = `/api/midi/${id}/download/dts`
        if (f.endsWith('.ac3')) ac3Path = `/api/midi/${id}/download/ac3`
      }
    }
    status.files = { dts: dtsPath, ac3: ac3Path }
  }

  return NextResponse.json(status)
}
