// app/api/health/route.ts
// Health check endpoint to keep serverless functions warm

import { NextResponse } from 'next/server';

export const maxDuration = 10;

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'doppel-slack-bot'
  });
}

