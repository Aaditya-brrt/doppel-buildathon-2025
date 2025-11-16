// app/api/composio/connect/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Composio } from '@composio/core';

type ConnectionRequestResponse = {
    id: string;
    redirectUrl?: string | null;
  };

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
});

// Map tool names to their auth config IDs from environment variables
// Note: Make sure these env vars are set in your .env file
const TOOL_AUTH_CONFIG_IDS: Record<string, string> = {
  'Google Calendar': process.env.NEXT_PUBLIC_GOOGLECALENDAR_AUTH_CONFIG_ID || process.env.GOOGLECALENDAR_AUTH_CONFIG_ID || '',
  'Slack': process.env.NEXT_PUBLIC_SLACK_AUTH_CONFIG_ID || process.env.SLACK_AUTH_CONFIG_ID || '',
  'Linear': process.env.NEXT_PUBLIC_LINEAR_AUTH_CONFIG_ID || process.env.LINEAR_AUTH_CONFIG_ID || '',
  'GitHub': process.env.NEXT_PUBLIC_GITHUB_AUTH_CONFIG_ID || process.env.GITHUB_AUTH_CONFIG_ID || '',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tool = searchParams.get('tool');
  const userId = searchParams.get('user');

  if (!tool || !userId) {
    return NextResponse.json(
      { error: 'Missing tool or user parameter' },
      { status: 400 }
    );
  }

  const authConfigId = TOOL_AUTH_CONFIG_IDS[tool];
  if (!authConfigId) {
    return NextResponse.json(
      { error: `No auth config found for tool: ${tool}` },
      { status: 400 }
    );
  }

  try {
    // First, check for existing connections (including INITIATED ones)
    const existingConnections = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Find any existing connection for this auth config (including INITIATED state)
    let existingConnection: { id?: string; status?: string; redirectUrl?: string } | null = null;
    if (existingConnections && Array.isArray(existingConnections)) {
      existingConnection = existingConnections.find(
        (conn: { authConfigId?: string; auth_config_id?: string; status?: string }) => {
          const connAuthConfigId = conn.authConfigId || conn.auth_config_id;
          return connAuthConfigId === authConfigId && 
                 (conn.status === 'INITIATED' || conn.status === 'ACTIVE');
        }
      ) || null;
    }

    // If there's an INITIATED connection, try to get its redirect URL
    if (existingConnection && existingConnection.status === 'INITIATED' && existingConnection.id) {
      try {
        // Get the connection request details
        const connectionRequest = await composio.connectedAccounts.get(existingConnection.id) as ConnectionRequestResponse;
        if (connectionRequest && connectionRequest.redirectUrl) {
          return NextResponse.json({
            redirectUrl: connectionRequest.redirectUrl,
            connectionRequestId: existingConnection.id,
            resumed: true,
          });
        }
        // If we can't get redirectUrl, delete the old INITIATED connection
        await composio.connectedAccounts.delete(existingConnection.id);
      } catch (err) {
        console.error('Error getting existing connection:', err);
        // Try to delete the old connection if possible
        if (existingConnection.id) {
          try {
            await composio.connectedAccounts.delete(existingConnection.id);
          } catch (deleteErr) {
            console.error('Error deleting old connection:', deleteErr);
          }
        }
        // Fall through to create a new one
      }
    }

    // If there's an ACTIVE connection, return error (should disconnect first)
    if (existingConnection && existingConnection.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'Connection already exists. Please disconnect first.' },
        { status: 400 }
      );
    }

    // Initiate a new OAuth connection
    const connectionRequest = await composio.connectedAccounts.initiate(
      userId,
      authConfigId,
    ) as ConnectionRequestResponse;

    // Return JSON with redirectUrl and connectionRequestId for popup flow
    if (!connectionRequest.redirectUrl) {
      return NextResponse.json(
        { error: 'No redirect URL received from Composio' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl,
      connectionRequestId: connectionRequest.id,
    });
  } catch (error) {
    console.error('Error initiating Composio connection:', error);
    return NextResponse.json(
      { error: 'Failed to initiate connection' },
      { status: 500 }
    );
  }
}

