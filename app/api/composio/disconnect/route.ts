// app/api/composio/disconnect/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
});

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const connectionId = searchParams.get('connectionId');

  if (!connectionId) {
    return NextResponse.json(
      { error: 'Missing connectionId parameter' },
      { status: 400 }
    );
  }

  try {
    // Delete the connection
    await composio.connectedAccounts.delete(connectionId);

    return NextResponse.json({
      success: true,
      message: 'Connection deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting Composio connection:', error);
    return NextResponse.json(
      { error: 'Failed to delete connection' },
      { status: 500 }
    );
  }
}

