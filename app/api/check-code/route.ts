import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { code } = await req.json()
  if (!code || code !== process.env.TEAM_ACCESS_CODE) {
    return NextResponse.json({ error: 'Invalid team access code.' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
