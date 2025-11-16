// app/page.tsx

export default function Home() {
  return (
    <div className="min-h-screen gradient-black-purple flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12 lg:mb-16">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="gradient-purple-text">🤖 Meet Doppel</span>
          </h1>
          <p className="text-xl sm:text-2xl text-purple-200 font-light leading-relaxed">
            Your AI teammate that works while you sleep
          </p>
        </div>
        
        <div className="bg-black/40 backdrop-blur-sm rounded-xl shadow-xl border border-purple-500/20 p-6 sm:p-8 lg:p-10 mb-8 lg:mb-12 hover:border-purple-500/40 transition-all duration-300">
          <div className="space-y-6 sm:space-y-8">
            <FeatureCard
              icon="⏰"
              title="Works Across Time Zones"
              description="Your team halfway across the globe can give answers at any time. No more 8-hour delays."
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
          <p className="text-purple-300 mb-6 text-lg font-medium">Ready to try it?</p>
          <code className="bg-black/60 border border-purple-500/30 text-purple-300 px-6 py-3 rounded-lg inline-block font-mono text-sm sm:text-base hover:border-purple-500/50 hover:bg-black/80 transition-all duration-300 shadow-lg">
            Type /setup-agent in Slack
          </code>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 sm:gap-6 p-4 rounded-lg hover:bg-purple-500/5 transition-all duration-300 group">
      <div className="text-4xl sm:text-5xl group-hover:scale-110 transition-transform duration-300">{icon}</div>
      <div className="flex-1">
        <h3 className="font-bold text-lg sm:text-xl mb-2 text-white group-hover:text-purple-300 transition-colors duration-300">{title}</h3>
        <p className="text-purple-200/80 leading-relaxed text-base sm:text-lg">{description}</p>
      </div>
    </div>
  );
}