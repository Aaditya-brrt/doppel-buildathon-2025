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
    
    connections.forEach((connection: unknown) => {
      if (!connection || typeof connection !== 'object') return;
      
      const conn = connection as {
        id?: string;
        connected_account_id?: string;
        authConfigId?: string;
        auth_config_id?: string;
        auth_config?: { id?: string };
        status?: string;
      };

      // Extract auth config ID from various possible locations
      const authConfigId = 
        conn.authConfigId || 
        conn.auth_config_id || 
        conn.auth_config?.id;

      // Extract connection ID from various possible locations
      const connectionId = 
        conn.id || 
        conn.connected_account_id;

      // Extract status
      const status = conn.status;

      if (authConfigId && authConfigToTool[authConfigId]) {
        const tool = authConfigToTool[authConfigId];
        
        // Only consider ACTIVE connections as connected
        // INITIATED connections are pending
        if (status === 'ACTIVE' || (!status && connectionId)) {
          connectedTools.add(tool);
          if (connectionId) {
            toolConnectionIds[tool] = connectionId;
          }
        }
      }
    });

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

