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
    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
    });

    // Create a map of auth config IDs to tool names (reverse lookup)
    const authConfigToTool: Record<string, string> = {};
    Object.entries(TOOL_AUTH_CONFIG_IDS).forEach(([tool, authConfigId]) => {
      if (authConfigId) {
        authConfigToTool[authConfigId] = tool;
      }
    });

    // Map connections to tools
    const connectedTools = new Set<string>();
    
    if (connections && Array.isArray(connections)) {
      connections.forEach((connection: { authConfigId?: string; auth_config_id?: string }) => {
        // Check if this connection matches any of our tools
        const authConfigId = connection.authConfigId || connection.auth_config_id;
        if (authConfigId && authConfigToTool[authConfigId]) {
          connectedTools.add(authConfigToTool[authConfigId]);
        }
      });
    }

    return NextResponse.json({
      connectedTools: Array.from(connectedTools),
    });
  } catch (error) {
    console.error('Error fetching connection status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connection status' },
      { status: 500 }
    );
  }
}

