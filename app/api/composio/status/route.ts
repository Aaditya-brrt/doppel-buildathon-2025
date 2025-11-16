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
    
    // Process connections - may need to get full details for each
    for (const connection of connections) {
      if (!connection || typeof connection !== 'object') continue;
      
      const conn = connection as Record<string, unknown>;
      
      // Extract connection ID first
      const connectionId = 
        (conn.id as string) || 
        (conn.connected_account_id as string);

      if (!connectionId) continue;

      // Extract status
      const status = conn.status as string | undefined;

      // Only process ACTIVE connections
      if (status !== 'ACTIVE') continue;

      // Try to get full connection details to get auth_config.id
      let authConfigId: string | undefined;
      try {
        const fullConnection = await composio.connectedAccounts.get(connectionId);
        if (fullConnection && typeof fullConnection === 'object') {
          const fullConn = fullConnection as Record<string, unknown>;
          // Try various ways to get auth config ID
          authConfigId = 
            (fullConn.authConfigId as string) ||
            (fullConn.auth_config_id as string) ||
            ((fullConn.auth_config as { id?: string })?.id) ||
            ((fullConn.auth_config as Record<string, unknown>)?.id as string);
        }
      } catch {
        // If get() fails, try to extract from the connection object directly
        authConfigId = 
          (conn.authConfigId as string) ||
          (conn.auth_config_id as string) ||
          ((conn.auth_config as { id?: string })?.id) ||
          ((conn.auth_config as Record<string, unknown>)?.id as string);
      }

      // If still no authConfigId, try one more time with the original connection
      if (!authConfigId) {
        authConfigId = 
          (conn.authConfigId as string) ||
          (conn.auth_config_id as string) ||
          ((conn.auth_config as { id?: string })?.id) ||
          ((conn.auth_config as Record<string, unknown>)?.id as string);
      }

      if (authConfigId && authConfigToTool[authConfigId]) {
        const tool = authConfigToTool[authConfigId];
        connectedTools.add(tool);
        toolConnectionIds[tool] = connectionId;
      }
    }

    // Debug logging (can be removed in production)
    console.log('Connection status check:', {
      userId,
      totalConnections: connections.length,
      connectedTools: Array.from(connectedTools),
      connectionIds: toolConnectionIds,
      rawConnections: connections.map((c: unknown) => {
        const conn = c as Record<string, unknown>;
        return {
          id: conn.id || conn.connected_account_id,
          authConfigId: conn.authConfigId || conn.auth_config_id || (conn.auth_config as { id?: string })?.id,
          status: conn.status,
        };
      }),
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

