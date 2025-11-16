// app/setup/page.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SetupContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('user');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-4xl font-bold mb-4">🤖 Your AI Agent</h1>
        <p className="text-gray-600 mb-8">
          Connect your accounts so your agent can help your team 24/7.
        </p>
        
        <div className="space-y-4 mb-8">
          {['Google Calendar', 'Slack', 'Jira', 'GitHub'].map(source => (
            <div key={source} className="border rounded-lg p-4 flex justify-between items-center hover:bg-gray-50">
              <div>
                <h3 className="font-semibold">{source}</h3>
                <p className="text-sm text-gray-500">Access your {source.toLowerCase()} data</p>
              </div>
              <button 
                onClick={() => alert('🎉 OAuth coming soon! For now, using demo data.')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-green-800 mb-2">
            ✅ Demo Mode Active
          </h2>
          <p className="text-green-700 mb-4">
            Your agent is ready with sample data. Teammates can ask questions by mentioning your agent in Slack!
          </p>
          <p className="text-sm text-gray-600">
            Try it: <code className="bg-gray-100 px-2 py-1 rounded">@Team Agent Bot ask @yourname what are you working on?</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-4xl font-bold mb-4">🤖 Your AI Agent</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <SetupContent />
    </Suspense>
  );
}