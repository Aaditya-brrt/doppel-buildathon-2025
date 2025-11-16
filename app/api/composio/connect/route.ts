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
    const response = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Handle different response structures
    let existingConnections: unknown[] = [];
    if (Array.isArray(response)) {
      existingConnections = response;
    } else if (response && typeof response === 'object' && 'items' in response) {
      existingConnections = (response as { items: unknown[] }).items || [];
    }

    // Find any existing connection for this auth config
    let existingConnection: { id?: string; status?: string; redirectUrl?: string } | null = null;
    
    for (const conn of existingConnections) {
      if (!conn || typeof conn !== 'object') continue;
      
      const connection = conn as Record<string, unknown>;
      const connectionId = (connection.id as string) || (connection.connected_account_id as string);
      const status = connection.status as string | undefined;
      
      if (!connectionId) continue;

      // Get auth config ID from the connection
      let connAuthConfigId: string | undefined;
      try {
        // Try to get full connection details
        const fullConnection = await composio.connectedAccounts.get(connectionId);
        if (fullConnection && typeof fullConnection === 'object') {
          const fullConn = fullConnection as Record<string, unknown>;
          connAuthConfigId = 
            (fullConn.authConfigId as string) ||
            (fullConn.auth_config_id as string) ||
            ((fullConn.auth_config as { id?: string })?.id) ||
            ((fullConn.auth_config as Record<string, unknown>)?.id as string);
        }
      } catch {
        // Fallback to extracting from connection object
        connAuthConfigId = 
          (connection.authConfigId as string) ||
          (connection.auth_config_id as string) ||
          ((connection.auth_config as { id?: string })?.id) ||
          ((connection.auth_config as Record<string, unknown>)?.id as string);
      }

      // Check if this connection matches our auth config
      if (connAuthConfigId === authConfigId && (status === 'INITIATED' || status === 'ACTIVE')) {
        existingConnection = {
          id: connectionId,
          status,
        };
        break;
      }
    }

    // If there's an ACTIVE connection, return it (don't try to create a new one)
    if (existingConnection && existingConnection.status === 'ACTIVE') {
      return NextResponse.json({
        redirectUrl: null,
        connectionRequestId: existingConnection.id,
        alreadyConnected: true,
        message: 'Connection already exists',
      });
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

