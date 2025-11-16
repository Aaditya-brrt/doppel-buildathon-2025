// app/api/composio/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
});

// Map tool names to their auth config IDs (same as in connect route)
const TOOL_AUTH_CONFIG_IDS: Record<string, string> = {
  'Google Calendar': process.env.NEXT_PUBLIC_GOOGLECALENDAR_AUTH_CONFIG_ID || process.env.GOOGLECALENDAR_AUTH_CONFIG_ID || '',
  'Slack': process.env.NEXT_PUBLIC_SLACK_AUTH_CONFIG_ID || process.env.SLACK_AUTH_CONFIG_ID || '',
  'Linear': process.env.NEXT_PUBLIC_LINEAR_AUTH_CONFIG_ID || process.env.LINEAR_AUTH_CONFIG_ID || '',
  'GitHub': process.env.NEXT_PUBLIC_GITHUB_AUTH_CONFIG_ID || process.env.GITHUB_AUTH_CONFIG_ID || '',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user');

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing user parameter' },
      { status: 400 }
    );
  }

  try {
    // Get all connections for this user
    const response = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Handle different response structures - could be array or object with items
    let connections: unknown[] = [];
    if (Array.isArray(response)) {
      connections = response;
    } else if (response && typeof response === 'object' && 'items' in response) {
      connections = (response as { items: unknown[] }).items || [];
    }

    // Create a map of auth config IDs to tool names (reverse lookup)
    const authConfigToTool: Record<string, string> = {};
    Object.entries(TOOL_AUTH_CONFIG_IDS).forEach(([tool, authConfigId]) => {
      if (authConfigId) {
        authConfigToTool[authConfigId] = tool;
      }
    });

    // Map connections to tools and store connection IDs
    const connectedTools = new Set<string>();
    const toolConnectionIds: Record<string, string> = {};
    
    // Process connections - extract auth_config from the response
    for (const connection of connections) {
      if (!connection || typeof connection !== 'object') continue;
      
      const conn = connection as Record<string, unknown>;
      
      // Extract connection ID
      const connectionId = 
        (conn.id as string) || 
        (conn.connected_account_id as string) ||
        (conn.connected_account_id as string);

      if (!connectionId) continue;

      // Extract status
      const status = conn.status as string | undefined;

      // Only process ACTIVE connections
      if (status !== 'ACTIVE') continue;

      // Extract auth config ID - try all possible locations
      let authConfigId: string | undefined;
      
      // First try direct fields
      authConfigId = 
        (conn.authConfigId as string) ||
        (conn.auth_config_id as string);
      
      // If not found, try nested auth_config object
      if (!authConfigId && conn.auth_config) {
        const authConfig = conn.auth_config as Record<string, unknown>;
        authConfigId = (authConfig.id as string) || (authConfig.auth_config_id as string);
      }
      
      // If still not found, try getting full connection details
      if (!authConfigId) {
        try {
          const fullConnection = await composio.connectedAccounts.get(connectionId);
          if (fullConnection && typeof fullConnection === 'object') {
            const fullConn = fullConnection as Record<string, unknown>;
            
            authConfigId = 
              (fullConn.authConfigId as string) ||
              (fullConn.auth_config_id as string);
            
            if (!authConfigId && fullConn.auth_config) {
              const authConfig = fullConn.auth_config as Record<string, unknown>;
              authConfigId = (authConfig.id as string) || (authConfig.auth_config_id as string);
            }
          }
        } catch (getError) {
          console.error('Error getting connection details:', getError);
          // Continue without auth config ID
        }
      }

      if (authConfigId && authConfigToTool[authConfigId]) {
        const tool = authConfigToTool[authConfigId];
        connectedTools.add(tool);
        toolConnectionIds[tool] = connectionId;
      }
    }

    // Debug logging - log the full raw response to understand structure
    console.log('Connection status check:', {
      userId,
      totalConnections: connections.length,
      connectedTools: Array.from(connectedTools),
      connectionIds: toolConnectionIds,
      rawResponse: JSON.stringify(response, null, 2).substring(0, 2000), // First 2000 chars
      firstConnection: connections.length > 0 ? JSON.stringify(connections[0], null, 2).substring(0, 1000) : 'none',
    });

    return NextResponse.json({
      connectedTools: Array.from(connectedTools),
      connectionIds: toolConnectionIds,
    });
  } catch (error) {
    console.error('Error fetching connection status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connection status' },
      { status: 500 }
    );
  }
}

