// app/api/composio/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user');
  const tool = searchParams.get('tool');
  const connectionRequestId = searchParams.get('connectionRequestId') || searchParams.get('id');

  if (!userId || !tool) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL || request.nextUrl.origin}/setup?user=${userId || ''}&error=missing_params`
    );
  }

  try {
    let connectionSuccess = false;
    
    // If we have a connection request ID, wait for the connection
    if (connectionRequestId) {
      try {
        const connectedAccount = await composio.connectedAccounts.waitForConnection(
          connectionRequestId,
          60 // 60 second timeout
        );
        
        if (connectedAccount) {
          connectionSuccess = true;
        }
      } catch (waitError) {
        console.error('Error waiting for connection:', waitError);
        // Fall through to try listing connections
      }
    }

    // Fallback: List connections for this user and check if a new one was created
    if (!connectionSuccess) {
      try {
        const connections = await composio.connectedAccounts.list({
          userIds: [userId],
        });
        
        // If we have connections, assume the latest one is the new connection
        if (connections && Array.isArray(connections) && connections.length > 0) {
          connectionSuccess = true;
        }
      } catch (listError) {
        console.error('Error listing connections:', listError);
      }
    }

    // Return HTML page that closes popup and notifies parent window
    const success = connectionSuccess;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection ${success ? 'Success' : 'Complete'}</title>
        </head>
        <body>
          <script>
            // Send message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'composio-oauth-complete',
                success: ${success},
                tool: '${tool}',
                userId: '${userId}'
              }, '*');
            }
            // Close popup after a short delay
            setTimeout(() => {
              window.close();
            }, 1000);
          </script>
          <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
            <div style="text-align: center;">
              <h1>${success ? '✅ Connection Successful!' : 'Connection Complete'}</h1>
              <p>This window will close automatically...</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error in Composio callback:', error);
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Error</title>
        </head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'composio-oauth-complete',
                success: false,
                tool: '${tool}',
                userId: '${userId}',
                error: 'callback_error'
              }, '*');
            }
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
          <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
            <div style="text-align: center;">
              <h1>❌ Connection Error</h1>
              <p>This window will close automatically...</p>
            </div>
          </div>
        </body>
      </html>
    `;
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
}

