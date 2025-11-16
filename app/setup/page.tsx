// app/setup/page.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';

function SetupContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('user');
  const connected = searchParams.get('connected');
  const error = searchParams.get('error');
  
  const [connectedTools, setConnectedTools] = useState<Set<string>>(new Set());
  const [connectionIds, setConnectionIds] = useState<Record<string, string>>({});
  const [connectingTool, setConnectingTool] = useState<string | null>(null);
  const [disconnectingTool, setDisconnectingTool] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Fetch connection status on mount
  useEffect(() => {
    const fetchConnectionStatus = async () => {
      if (!userId) {
        setLoadingStatus(false);
        return;
      }

      try {
        const response = await fetch(`/api/composio/status?user=${encodeURIComponent(userId)}`);
        if (response.ok) {
          const data = await response.json();
          setConnectedTools(new Set(data.connectedTools || []));
          setConnectionIds(data.connectionIds || {});
        }
      } catch (err) {
        console.error('Error fetching connection status:', err);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchConnectionStatus();
  }, [userId]);

  // Update connected tools when a new connection is made
  useEffect(() => {
    if (connected) {
      setConnectedTools(prev => new Set(prev).add(connected));
      // Clear URL parameter after showing success message
      const timer = setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname + `?user=${userId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [connected, userId]);

  const handleConnect = async (tool: string) => {
    if (!userId) {
      alert('User ID is required');
      return;
    }

    setConnectingTool(tool);
    
    try {
      // Call the API to get the redirect URL
      const response = await fetch(
        `/api/composio/connect?tool=${encodeURIComponent(tool)}&user=${encodeURIComponent(userId)}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to initiate connection');
      }

      const data = await response.json();
      const { redirectUrl } = data;

      if (!redirectUrl) {
        throw new Error('No redirect URL received');
      }

      // Open OAuth flow in popup window
      const popup = window.open(
        redirectUrl,
        'composio-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
      );

      if (!popup) {
        alert('Popup Blocked: Please allow popups for this site to complete the connection');
        setConnectingTool(null);
        return;
      }

      // Listen for messages from the popup
      const messageHandler = async (event: MessageEvent) => {
        // In production, you should verify event.origin for security
        if (event.data.type === 'composio-oauth-complete') {
          window.removeEventListener('message', messageHandler);
          
          if (event.data.success) {
            // Wait a bit for connection to be fully processed, then refresh status
            // Retry a few times in case the connection isn't immediately ACTIVE
            let retries = 5;
            const checkStatus = async (): Promise<boolean> => {
              const statusResponse = await fetch(`/api/composio/status?user=${encodeURIComponent(userId)}`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                const hasConnection = statusData.connectedTools?.includes(tool);
                const connectionId = statusData.connectionIds?.[tool];
                
                if (hasConnection && connectionId) {
                  // Connection is ready with ID
                  setConnectedTools(new Set(statusData.connectedTools || []));
                  setConnectionIds(statusData.connectionIds || {});
                  return true;
                } else if (retries > 0) {
                  // Retry after a short delay
                  retries--;
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  return checkStatus();
                } else {
                  // Still not connected after retries, but update anyway
                  setConnectedTools(new Set(statusData.connectedTools || []));
                  setConnectionIds(statusData.connectionIds || {});
                  return false;
                }
              }
              return false;
            };
            
            await checkStatus();
            // Show success message
            alert(`✅ Successfully connected ${tool}!`);
          } else {
            alert(`Failed to connect ${tool}. Please try again.`);
          }
          
          setConnectingTool(null);
        }
      };

      window.addEventListener('message', messageHandler);

      // Also check if popup was closed manually
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', messageHandler);
          setConnectingTool(null);
        }
      }, 500);

    } catch (err) {
      console.error('Error initiating connection:', err);
      alert(err instanceof Error ? err.message : 'Failed to initiate connection. Please try again.');
      setConnectingTool(null);
    }
  };

  const handleDisconnect = async (tool: string) => {
    if (!userId) {
      alert('User ID is required');
      return;
    }

    const connectionId = connectionIds[tool];
    if (!connectionId) {
      alert('Connection ID not found');
      return;
    }

    if (!confirm(`Are you sure you want to disconnect ${tool}?`)) {
      return;
    }

    setDisconnectingTool(tool);

    try {
      const response = await fetch(
        `/api/composio/disconnect?connectionId=${encodeURIComponent(connectionId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disconnect');
      }

      // Update state to remove the connection
      setConnectedTools(prev => {
        const newSet = new Set(prev);
        newSet.delete(tool);
        return newSet;
      });
      
      setConnectionIds(prev => {
        const newIds = { ...prev };
        delete newIds[tool];
        return newIds;
      });

      alert(`✅ Successfully disconnected ${tool}!`);
    } catch (err) {
      console.error('Error disconnecting:', err);
      alert(err instanceof Error ? err.message : 'Failed to disconnect. Please try again.');
    } finally {
      setDisconnectingTool(null);
    }
  };

  const tools = ['Google Calendar', 'Slack', 'Linear', 'GitHub'];

  return (
    <div className="min-h-screen gradient-black-purple p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto bg-black/40 backdrop-blur-sm rounded-xl shadow-xl border border-purple-500/20 p-6 sm:p-8 lg:p-10">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-white">
          Your AI Agent
        </h1>
        <p className="text-purple-200/80 mb-8 sm:mb-10 text-base sm:text-lg leading-relaxed">
          Connect your accounts so your agent can help your team 24/7.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-300 text-sm">
              {error === 'missing_params' && 'Missing required parameters. Please try again.'}
              {error === 'connection_failed' && 'Connection failed. Please try again.'}
              {error === 'callback_error' && 'An error occurred during connection. Please try again.'}
              {!['missing_params', 'connection_failed', 'callback_error'].includes(error) && 'An error occurred. Please try again.'}
            </p>
          </div>
        )}

        {connected && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
            <p className="text-green-300 text-sm">
              ✅ Successfully connected {connected}!
            </p>
          </div>
        )}
        
        <div className="space-y-4 sm:space-y-5 mb-8 sm:mb-10">
          {loadingStatus ? (
            <div className="text-center py-8">
              <p className="text-purple-200/70">Loading connection status...</p>
            </div>
          ) : (
            tools.map(tool => {
              const isConnected = connectedTools.has(tool);
              const isConnecting = connectingTool === tool;
              const isDisconnecting = disconnectingTool === tool;
              
              return (
                <div 
                  key={tool} 
                  className="border border-purple-500/20 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/20 hover:bg-purple-500/5 hover:border-purple-500/40 transition-all duration-300 group"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg sm:text-xl mb-1 text-white group-hover:text-purple-300 transition-colors duration-300">
                      {tool}
                      {isConnected && <span className="ml-2 text-green-400">✓</span>}
                    </h3>
                    <p className="text-sm sm:text-base text-purple-200/70">
                      {isConnected ? 'Connected' : `Access your ${tool.toLowerCase()} data`}
                    </p>
                  </div>
                  <button 
                    onClick={() => isConnected ? handleDisconnect(tool) : handleConnect(tool)}
                    disabled={isConnecting || isDisconnecting}
                    className={`${
                      isConnected 
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 hover:border-red-500/50' 
                        : isConnecting || isDisconnecting
                        ? 'bg-purple-500/50 text-purple-200 cursor-wait'
                        : 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] hover:shadow-lg hover:shadow-purple-500/30 active:scale-95'
                    } px-6 py-2.5 sm:px-8 sm:py-3 rounded-lg font-medium transition-all duration-300 w-full sm:w-auto`}
                  >
                    {isDisconnecting ? 'Disconnecting...' : isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              );
            })
          )}
        </div>
        
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5 sm:p-6 hover:border-purple-500/50 transition-all duration-300">
          <p className="text-sm sm:text-base text-purple-200/90 leading-relaxed">
            Try it: <code className="bg-black/60 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg font-mono text-xs sm:text-sm ml-1">@Team Agent Bot ask @yourname what are you working on?</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen gradient-black-purple p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto bg-black/40 backdrop-blur-sm rounded-xl shadow-xl border border-purple-500/20 p-6 sm:p-8 lg:p-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-white">Your AI Agent</h1>
          <p className="text-purple-200/80">Loading...</p>
        </div>
      </div>
    }>
      <SetupContent />
    </Suspense>
  );
}