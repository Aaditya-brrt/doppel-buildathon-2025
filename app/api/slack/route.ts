// app/api/slack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { getAgentData, getAllAgentIds } from '@/lib/demo-data';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function POST(request: NextRequest) {
  console.log('[SLACK] Received POST request');
  let body: Record<string, unknown>;
  
  // Check content type - Slack sends slash commands as form data, events as JSON
  const contentType = request.headers.get('content-type') || '';
  console.log('[SLACK] Content-Type:', contentType);
  
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Parse form data for slash commands
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    console.log('[SLACK] Parsed form data:', body);
  } else {
    // Parse JSON for events and URL verification
    try {
      body = await request.json() as Record<string, unknown>;
      console.log('[SLACK] Parsed JSON body:', JSON.stringify(body, null, 2));
    } catch (error) {
      console.error('[SLACK] Failed to parse request body:', error);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  }
  
  // Handle Slack URL verification
  if (body.type === 'url_verification') {
    console.log('[SLACK] URL verification challenge');
    return NextResponse.json({ challenge: body.challenge });
  }
  
  // Handle slash command
  if (body.command === '/setup-agent') {
    console.log('[SLACK] Slash command detected:', body.command);
    await handleSetupCommand({
      user_id: String(body.user_id || ''),
      channel_id: String(body.channel_id || '')
    });
    return NextResponse.json({ ok: true });
  }
  
  // Handle app mention
  if (body.event && typeof body.event === 'object' && 'type' in body.event && body.event.type === 'app_mention') {
    console.log('[SLACK] App mention event detected');
    const event = body.event as unknown as { text: string; channel: string; ts: string; user?: string };
    console.log('[SLACK] Event details:', {
      text: event.text,
      channel: event.channel,
      ts: event.ts,
      user: event.user
    });
    // Process async (don't make Slack wait)
    handleAppMention(event).catch((error) => {
      console.error('[SLACK] Error in handleAppMention:', error);
    });
    return NextResponse.json({ ok: true });
  }
  
  console.log('[SLACK] Unhandled request type, body keys:', Object.keys(body));
  return NextResponse.json({ ok: true });
}

async function handleSetupCommand(body: { user_id: string; channel_id: string }) {
  const userId = body.user_id;
  const setupUrl = `${process.env.NEXT_PUBLIC_URL}/setup?user=${userId}`;
  
  await slack.chat.postEphemeral({
    channel: body.channel_id,
    user: userId,
    text: `🤖 Set up your AI agent`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🤖 Set Up Your AI Agent*\n\nConnect your accounts so teammates can ask your agent questions while you\'re offline.'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🚀 Set Up Now', emoji: true },
            url: setupUrl,
            style: 'primary'
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 Your agent will answer questions based on your Calendar, Slack, Jira, and more!'
          }
        ]
      }
    ]
  });
}

async function handleAppMention(event: { text: string; channel: string; ts: string }) {
  console.log('[HANDLE_MENTION] Starting to handle app mention');
  const text = event.text;
  const channel = event.channel;
  const threadTs = event.ts;
  
  console.log('[HANDLE_MENTION] Original text:', text);
  
  // Parse the message to extract target user and question
  const { targetUserId, question } = parseMessage(text);
  console.log('[HANDLE_MENTION] Parsed result:', { targetUserId, question });
  
  if (!targetUserId || !question) {
    console.log('[HANDLE_MENTION] Missing targetUserId or question, sending error message');
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '❓ I couldn\'t understand that. Try:\n`@Team Agent Bot ask @john what is he working on?`'
    });
    return;
  }
  
  console.log('[HANDLE_MENTION] Looking up agent data for userId:', targetUserId);
  console.log('[HANDLE_MENTION] Available agent IDs:', getAllAgentIds());
  // Get agent data
  const agentData = getAgentData(targetUserId);
  
  if (!agentData) {
    console.log('[HANDLE_MENTION] No agent data found for userId:', targetUserId);
    console.log('[HANDLE_MENTION] Available agent IDs are:', getAllAgentIds());
    const userInfo = await slack.users.info({ user: targetUserId });
    console.log('[HANDLE_MENTION] User info:', userInfo.user?.name);
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `😕 @${userInfo.user?.name} hasn't set up their agent yet. They can use \`/setup-agent\` to get started!`
    });
    return;
  }
  
  console.log('[HANDLE_MENTION] Found agent data:', {
    name: agentData.name,
    displayName: agentData.displayName,
    hasCalendar: agentData.data.calendar.length > 0,
    hasSlack: agentData.data.slack.length > 0,
    hasJira: agentData.data.jira.length > 0
  });
  
  // Show thinking message
  console.log('[HANDLE_MENTION] Posting thinking message');
  const thinkingMsg = await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🤔 Asking ${agentData.displayName}'s agent...`
  });
  
  try {
    // Build context for AI
    console.log('[HANDLE_MENTION] Building context for AI');
    const context = buildContext(agentData, question);
    console.log('[HANDLE_MENTION] Context length:', context.length);
    
    // Query DeepSeek using Vercel AI SDK
    console.log('[HANDLE_MENTION] Calling DeepSeek LLM...');
    const startTime = Date.now();
    const { text: answer } = await generateText({
      model: deepseek('deepseek-chat'),
      system: `You are an AI assistant representing ${agentData.displayName}. Answer questions based on the provided data about their work. Be helpful and concise. If you don't have enough information, say so.`,
      prompt: context,
      maxOutputTokens: 300,
      temperature: 0.7
    });
    const endTime = Date.now();
    console.log('[HANDLE_MENTION] LLM response received in', endTime - startTime, 'ms');
    console.log('[HANDLE_MENTION] Answer length:', answer.length);
    console.log('[HANDLE_MENTION] Answer preview:', answer.substring(0, 100));
    
    // Calculate sources
    const sources = [];
    if (agentData.data.calendar.length > 0) sources.push('Calendar');
    if (agentData.data.slack.length > 0) sources.push('Slack');
    if (agentData.data.jira.length > 0) sources.push('Jira');
    
    console.log('[HANDLE_MENTION] Updating Slack message with answer');
    // Update message with answer
    await slack.chat.update({
      channel,
      ts: thinkingMsg.ts!,
      text: answer,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🤖 *${agentData.displayName}'s Agent:*\n\n${answer}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📊 Demo Mode | 📎 Sources: ${sources.join(', ')}`
            }
          ]
        }
      ]
    });
    console.log('[HANDLE_MENTION] Successfully updated Slack message');
    
  } catch (error) {
    console.error('[HANDLE_MENTION] Error occurred:', error);
    if (error instanceof Error) {
      console.error('[HANDLE_MENTION] Error message:', error.message);
      console.error('[HANDLE_MENTION] Error stack:', error.stack);
    }
    await slack.chat.update({
      channel,
      ts: thinkingMsg.ts!,
      text: '❌ Sorry, I encountered an error. Please try again.'
    });
  }
}

function parseMessage(text: string): { targetUserId: string | null; question: string } {
  console.log('[PARSE_MESSAGE] Parsing text:', text);
  // Extract user mentions - format: <@U12345>
  const mentions = text.match(/<@(U[A-Z0-9]+)>/g);
  console.log('[PARSE_MESSAGE] Found mentions:', mentions);
  
  // First mention is the bot, second is the target user
  const targetUserId = mentions && mentions.length > 1 
    ? mentions[1].replace(/<@|>/g, '')
    : null;
  console.log('[PARSE_MESSAGE] Extracted targetUserId:', targetUserId);
  
  // Extract question (remove all mentions and common words)
  const question = text
    .replace(/<@[^>]+>/g, '')
    .replace(/agent/gi, '')
    .replace(/ask/gi, '')
    .replace(/what/gi, 'what')
    .replace(/\s+/g, ' ')
    .trim();
  console.log('[PARSE_MESSAGE] Extracted question:', question);
  
  return { targetUserId, question };
}

function buildContext(agentData: { displayName: string; data: { calendar: string[]; slack: string[]; jira: string[] } }, question: string): string {
  let context = `Based on the following information about ${agentData.displayName}, answer this question: "${question}"\n\n`;
  
  if (agentData.data.calendar.length > 0) {
    context += `**Calendar Events:**\n${agentData.data.calendar.map((e: string) => `- ${e}`).join('\n')}\n\n`;
  }
  
  if (agentData.data.slack.length > 0) {
    context += `**Recent Slack Messages:**\n${agentData.data.slack.map((m: string) => `- ${m}`).join('\n')}\n\n`;
  }
  
  if (agentData.data.jira.length > 0) {
    context += `**Jira Tickets:**\n${agentData.data.jira.map((t: string) => `- ${t}`).join('\n')}\n\n`;
  }
  
  return context;
}