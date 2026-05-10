import { NextResponse } from 'next/server'

// Public self-signup is disabled for this private company CRM.
export async function POST() {
  return NextResponse.json(
    { error: 'Self-signup is disabled. Ask an admin for an invite.' },
    { status: 403 }
  )
}
