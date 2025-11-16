// lib/demo-data.ts

export interface AgentData {
    name: string;
    displayName: string;
    data: {
      calendar: string[];
      slack: string[];
      jira: string[];
    };
  }
  
  // IMPORTANT: Replace U12345 and U67890 with YOUR actual Slack user IDs
  // To get your Slack user ID:
  // 1. Click your profile in Slack
  // 2. Click "More" → "Copy member ID"
  
  export const DEMO_AGENTS: Record<string, AgentData> = {
    'U12345': {  // REPLACE THIS with your Slack user ID
      name: 'john',
      displayName: 'John Smith',
      data: {
        calendar: [
          'Mon 2pm: Sprint Planning Meeting',
          'Tue 10am: Client Demo - Acme Corp',
          'Wed 3pm: 1-on-1 with Sarah',
          'Thu 11am: Architecture Review',
          'Fri 3pm: Team Retrospective'
        ],
        slack: [
          '[#engineering] Working on the new authentication API',
          '[#project-alpha] Status update: 80% complete, shipping Friday',
          '[#general] Out of office tomorrow afternoon',
          '[#backend] Fixed the performance issue in production'
        ],
        jira: [
          'PROJ-123: Implement OAuth 2.0 authentication (In Progress)',
          'PROJ-124: Fix mobile responsiveness on login page (Done)',
          'PROJ-125: Add rate limiting to API endpoints (To Do)',
          'PROJ-126: Update user profile UI (In Review)'
        ]
      }
    },
    'U67890': {  // REPLACE THIS with another team member's Slack user ID
      name: 'sarah',
      displayName: 'Sarah Johnson',
      data: {
        calendar: [
          'Mon 9am: Design Review',
          'Tue 11am: Design Review with Product',
          'Wed 2pm: User Research Session',
          'Thu 3pm: 1-on-1 with CEO',
          'Fri 10am: Design System Workshop'
        ],
        slack: [
          '[#design] New mockups ready for the dashboard redesign',
          '[#product] User feedback from last week\'s interviews',
          '[#general] Working from home today'
        ],
        jira: [
          'PROJ-200: Homepage redesign (In Review)',
          'PROJ-201: Mobile app icon refresh (Done)',
          'PROJ-202: Design system documentation (In Progress)'
        ]
      }
    }
  };
  
  export function getAgentData(userId: string): AgentData | null {
    return DEMO_AGENTS[userId] || null;
  }
  
  export function getAllAgentIds(): string[] {
    return Object.keys(DEMO_AGENTS);
  }