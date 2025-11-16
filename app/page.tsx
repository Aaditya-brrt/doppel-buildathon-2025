// app/page.tsx

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🤖 Team Agent
          </h1>
          <p className="text-2xl text-gray-600">
            Your AI teammate that works while you sleep
          </p>
        </div>
        
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
          <div className="space-y-6">
            <FeatureCard
              icon="⏰"
              title="Works Across Time Zones"
              description="Your team in India can get answers at 2am your time. No more 8-hour delays."
            />
            <FeatureCard
              icon="🎯"
              title="Answers with Your Data"
              description="Connected to your Calendar, Slack, Jira, and GitHub for accurate responses."
            />
            <FeatureCard
              icon="✅"
              title="You Stay in Control"
              description="Review what your agent said each morning. Set rules for escalation."
            />
          </div>
        </div>
        
        <div className="text-center">
          <p className="text-gray-500 mb-4">Ready to try it?</p>
          <code className="bg-gray-800 text-green-400 px-4 py-2 rounded-lg inline-block">
            Type /setup-agent in Slack
          </code>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="text-4xl">{icon}</div>
      <div>
        <h3 className="font-bold text-lg mb-1">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}