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
    // Initiate a new OAuth connection with allowMultiple: false to prevent duplicates
    // If a connection already exists, this will throw an error that we can catch
    let connectionRequest: ConnectionRequestResponse;
    
    try {
      connectionRequest = await composio.connectedAccounts.initiate(
        userId,
        authConfigId,
      ) as ConnectionRequestResponse;
    } catch (initiateError) {
      // Check if this is the multiple accounts error
      const error = initiateError as { code?: string; message?: string };
      
      if (error.code === 'TS-SDK::MULTIPLE_CONNECTED_ACCOUNTS' || 
          (error.message && error.message.includes('Multiple connected accounts'))) {
        
        console.log('Multiple connections detected, finding existing connection...');
        
        // Get all connections for this user
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

        // Find the ACTIVE connection for this auth config
        for (const conn of existingConnections) {
          if (!conn || typeof conn !== 'object') continue;
          
          const connection = conn as Record<string, unknown>;
          const connectionId = (connection.id as string) || (connection.connected_account_id as string);
          const status = connection.status as string | undefined;
          
          if (!connectionId || status !== 'ACTIVE') continue;

          // Get full connection details to check auth config
          try {
            const fullConnection = await composio.connectedAccounts.get(connectionId);
            if (fullConnection && typeof fullConnection === 'object') {
              const fullConn = fullConnection as Record<string, unknown>;
              const connAuthConfigId = 
                (fullConn.authConfigId as string) ||
                (fullConn.auth_config_id as string) ||
                ((fullConn.auth_config as { id?: string })?.id) ||
                ((fullConn.auth_config as Record<string, unknown>)?.id as string);
              
              if (connAuthConfigId === authConfigId) {
                // Found the existing connection
                return NextResponse.json({
                  redirectUrl: null,
                  connectionRequestId: connectionId,
                  alreadyConnected: true,
                  message: 'Connection already exists',
                });
              }
            }
          } catch {
            continue;
          }
        }
        
        // If we get here, we couldn't find the connection, return error
        return NextResponse.json(
          { error: 'Multiple connections exist but could not locate the active one. Please contact support.' },
          { status: 500 }
        );
      }
      
      // If it's a different error, throw it
      throw initiateError;
    }

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

