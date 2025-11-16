// lib/logger.ts
// Structured logging for easier searching in Vercel

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
  };
}

function createLogger(service: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...(data && { data }),
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
        },
      }),
    };

    // Output as JSON for easy parsing in Vercel
    const logLine = JSON.stringify(entry);
    
    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(logLine);
        break;
      case 'warn':
        console.warn(logLine);
        break;
      case 'debug':
        // Only log debug in development
        if (process.env.NODE_ENV === 'development') {
          console.log(logLine);
        }
        break;
      default:
        console.log(logLine);
    }
  };

  return {
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, error?: Error, data?: Record<string, unknown>) => log('error', message, data, error),
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  };
}

export const logger = {
  slack: createLogger('SLACK'),
  mention: createLogger('MENTION'),
  parse: createLogger('PARSE'),
  llm: createLogger('LLM'),
};

