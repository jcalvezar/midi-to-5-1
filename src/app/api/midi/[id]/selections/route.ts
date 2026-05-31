import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const filePath = path.join(process.cwd(), 'uploads', id, 'selections.json')

  if (!existsSync(filePath)) {
    return NextResponse.json({ selections: null, soundfont: null })
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ selections: null, soundfont: null })
  }
}
