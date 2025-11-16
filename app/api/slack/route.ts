// app/api/slack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { getAgentData, getAllAgentIds } from '@/lib/demo-data';
import { logger } from '@/lib/logger';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function POST(request: NextRequest) {
  logger.slack.info('Received POST request');
  let body: Record<string, unknown>;
  
  // Check content type - Slack sends slash commands as form data, events as JSON
  const contentType = request.headers.get('content-type') || '';
  logger.slack.debug('Request content type', { contentType });
  
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Parse form data for slash commands
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    logger.slack.info('Parsed form data', { body });
  } else {
    // Parse JSON for events and URL verification
    try {
      body = await request.json() as Record<string, unknown>;
      logger.slack.debug('Parsed JSON body', { body });
    } catch (error) {
      logger.slack.error('Failed to parse request body', error as Error);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  }
  
  // Handle Slack URL verification
  if (body.type === 'url_verification') {
    logger.slack.info('URL verification challenge');
    return NextResponse.json({ challenge: body.challenge });
  }
  
  // Handle slash command
  if (body.command === '/setup-agent') {
    logger.slack.info('Slash command detected', { command: body.command });
    await handleSetupCommand({
      user_id: String(body.user_id || ''),
      channel_id: String(body.channel_id || '')
    });
    return NextResponse.json({ ok: true });
  }
  
  // Handle app mention or message events
  if (body.event && typeof body.event === 'object' && 'type' in body.event) {
    const event = body.event as Record<string, unknown>;
    
    // Ignore bot messages (including our own bot's messages)
    if (event.bot_id || event.subtype === 'bot_message') {
      logger.slack.debug('Ignoring bot message', { 
        botId: event.bot_id,
        subtype: event.subtype,
        text: event.text 
      });
      return NextResponse.json({ ok: true });
    }
    
    // Get bot user ID from authorizations (if available)
    const botUserId = Array.isArray(body.authorizations) && body.authorizations.length > 0
      ? (body.authorizations[0] as { user_id?: string })?.user_id
      : null;
    
    // Check if this is an app_mention event
    const isAppMention = event.type === 'app_mention';
    
    // Check if this is a message event that mentions the bot
    const isMessageWithMention = event.type === 'message' && 
      typeof event.text === 'string' && 
      botUserId &&
      event.text.includes(`<@${botUserId}>`);
    
    if (isAppMention || isMessageWithMention) {
      logger.slack.info('Bot mention detected', { 
        eventType: event.type,
        isAppMention,
        isMessageWithMention,
        botUserId
      });
      const mentionEvent = event as unknown as { text: string; channel: string; ts: string; user?: string };
      logger.slack.info('Event details', {
        text: mentionEvent.text,
        channel: mentionEvent.channel,
        ts: mentionEvent.ts,
        user: mentionEvent.user
      });
      // Process async (don't make Slack wait)
      handleAppMention(mentionEvent).catch((error) => {
        logger.slack.error('Error in handleAppMention', error as Error);
      });
      return NextResponse.json({ ok: true });
    }
    
    // For regular message events that don't mention the bot, just ignore silently
    if (event.type === 'message') {
      logger.slack.debug('Ignoring regular message event (no bot mention)', { 
        hasBotId: !!event.bot_id,
        text: typeof event.text === 'string' ? event.text.substring(0, 100) : undefined
      });
      return NextResponse.json({ ok: true });
    }
    
    // Log other event types for debugging
    logger.slack.debug('Received unhandled event type', { 
      eventType: event.type,
      hasBotId: !!event.bot_id
    });
    return NextResponse.json({ ok: true });
  }
  
  logger.slack.warn('Unhandled request type', { 
    bodyKeys: Object.keys(body),
    eventType: body.event && typeof body.event === 'object' && 'type' in body.event 
      ? (body.event as { type: string }).type 
      : 'no event'
  });
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
  logger.mention.info('Starting to handle app mention');
  const text = event.text;
  const channel = event.channel;
  const threadTs = event.ts;
  
  logger.mention.debug('Original message text', { text });
  
  // Parse the message to extract target user and question
  const { targetUserId, question } = parseMessage(text);
  logger.mention.info('Parsed message', { targetUserId, question });
  
  if (!targetUserId || !question) {
    logger.mention.warn('Missing targetUserId or question', { targetUserId, question });
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '❓ I couldn\'t understand that. Try:\n`@Team Agent Bot ask @john what is he working on?`'
    });
    return;
  }
  
  logger.mention.info('Looking up agent data', { 
    targetUserId, 
    availableAgentIds: getAllAgentIds() 
  });
  // Get agent data
  const agentData = getAgentData(targetUserId);
  
  if (!agentData) {
    logger.mention.warn('No agent data found', { 
      targetUserId, 
      availableAgentIds: getAllAgentIds() 
    });
    const userInfo = await slack.users.info({ user: targetUserId });
    logger.mention.info('User info retrieved', { userName: userInfo.user?.name });
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `😕 @${userInfo.user?.name} hasn't set up their agent yet. They can use \`/setup-agent\` to get started!`
    });
    return;
  }
  
  logger.mention.info('Found agent data', {
    name: agentData.name,
    displayName: agentData.displayName,
    hasCalendar: agentData.data.calendar.length > 0,
    hasSlack: agentData.data.slack.length > 0,
    hasJira: agentData.data.jira.length > 0
  });
  
  // Show thinking message
  logger.mention.debug('Posting thinking message');
  const thinkingMsg = await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Asking ${agentData.displayName}'s agent...`
  });
  
  try {
    // Build context for AI
    logger.mention.debug('Building context for AI');
    const context = buildContext(agentData, question);
    logger.mention.debug('Context built', { contextLength: context.length });
    
    // Query DeepSeek using Vercel AI SDK
    logger.llm.info('Calling DeepSeek LLM', { 
      model: 'deepseek-chat',
      questionLength: question.length,
      contextLength: context.length
    });
    const startTime = Date.now();
    const { text: answer } = await generateText({
      model: deepseek('deepseek-chat'),
      system: `You are an AI assistant representing ${agentData.displayName}. Answer questions based on the provided data about their work. Be helpful and concise. If you don't have enough information, say so.`,
      prompt: context,
      maxOutputTokens: 300,
      temperature: 0.7
    });
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.llm.info('LLM response received', {
      durationMs: duration,
      answerLength: answer.length,
      answerPreview: answer.substring(0, 100)
    });
    
    // Calculate sources
    const sources = [];
    if (agentData.data.calendar.length > 0) sources.push('Calendar');
    if (agentData.data.slack.length > 0) sources.push('Slack');
    if (agentData.data.jira.length > 0) sources.push('Jira');
    
    logger.mention.debug('Updating Slack message with answer');
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
    logger.mention.info('Successfully updated Slack message', { 
      channel, 
      messageTs: thinkingMsg.ts 
    });
    
  } catch (error) {
    logger.mention.error('Error in handleAppMention', error as Error, {
      channel,
      targetUserId,
      question
    });
    await slack.chat.update({
      channel,
      ts: thinkingMsg.ts!,
      text: '❌ Sorry, I encountered an error. Please try again.'
    });
  }
}

function parseMessage(text: string): { targetUserId: string | null; question: string } {
  logger.parse.debug('Parsing message', { text });
  // Extract user mentions - format: <@U12345>
  const mentions = text.match(/<@(U[A-Z0-9]+)>/g);
  logger.parse.debug('Found mentions', { mentions });
  
  // First mention is the bot, second is the target user
  const targetUserId = mentions && mentions.length > 1 
    ? mentions[1].replace(/<@|>/g, '')
    : null;
  
  // Extract question (remove all mentions and common words)
  const question = text
    .replace(/<@[^>]+>/g, '')
    .replace(/agent/gi, '')
    .replace(/ask/gi, '')
    .replace(/what/gi, 'what')
    .replace(/\s+/g, ' ')
    .trim();
  
  logger.parse.info('Message parsed', { targetUserId, question, mentionCount: mentions?.length || 0 });
  
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