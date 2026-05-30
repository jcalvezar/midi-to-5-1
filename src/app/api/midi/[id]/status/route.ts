import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const statusFile = path.join(process.cwd(), 'uploads', id, 'output', 'status.json')

  if (!existsSync(statusFile)) {
    return NextResponse.json({ status: 'pending', step: 0, total: 0, label: 'Iniciando...' })
  }

  let status: Record<string, unknown>
  try {
    status = JSON.parse(readFileSync(statusFile, 'utf-8'))
  } catch {
    return NextResponse.json({ status: 'pending', step: 0, total: 0, label: 'Iniciando...' })
  }

  if (status.status === 'completed') {
    const finalDir = path.join(process.cwd(), 'uploads', id, 'output', 'final')
    status.files = {
      dts: existsSync(path.join(finalDir, 'output.dts')) ? `/api/midi/${id}/download/dts` : null,
      ac3: existsSync(path.join(finalDir, 'output.ac3')) ? `/api/midi/${id}/download/ac3` : null,
    }
  }

  return NextResponse.json(status)
}
