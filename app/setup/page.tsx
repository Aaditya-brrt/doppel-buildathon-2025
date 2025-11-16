// app/setup/page.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SetupContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('user');

  return (
    <div className="min-h-screen gradient-black-purple p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto bg-black/40 backdrop-blur-sm rounded-xl shadow-xl border border-purple-500/20 p-6 sm:p-8 lg:p-10">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-white">
          Your AI Agent
        </h1>
        <p className="text-purple-200/80 mb-8 sm:mb-10 text-base sm:text-lg leading-relaxed">
          Connect your accounts so your agent can help your team 24/7.
        </p>
        
        <div className="space-y-4 sm:space-y-5 mb-8 sm:mb-10">
          {['Google Calendar', 'Slack', 'Jira', 'GitHub'].map(source => (
            <div 
              key={source} 
              className="border border-purple-500/20 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/20 hover:bg-purple-500/5 hover:border-purple-500/40 transition-all duration-300 group"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-lg sm:text-xl mb-1 text-white group-hover:text-purple-300 transition-colors duration-300">{source}</h3>
                <p className="text-sm sm:text-base text-purple-200/70">Access your {source.toLowerCase()} data</p>
              </div>
              <button 
                onClick={() => alert('🎉 OAuth coming soon! For now, using demo data.')}
                className="bg-[#8B5CF6] text-white px-6 py-2.5 sm:px-8 sm:py-3 rounded-lg font-medium hover:bg-[#7C3AED] hover:shadow-lg hover:shadow-purple-500/30 active:scale-95 transition-all duration-300 w-full sm:w-auto"
              >
                Connect
              </button>
            </div>
          ))}
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