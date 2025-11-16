// app/api/slack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { getAgentData } from '@/lib/demo-data';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Handle Slack URL verification
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }
  
  // Handle slash command
  if (body.command === '/setup-agent') {
    await handleSetupCommand(body);
    return NextResponse.json({ ok: true });
  }
  
  // Handle app mention
  if (body.event?.type === 'app_mention') {
    // Process async (don't make Slack wait)
    handleAppMention(body.event).catch(console.error);
    return NextResponse.json({ ok: true });
  }
  
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
  const text = event.text;
  const channel = event.channel;
  const threadTs = event.ts;
  
  // Parse the message to extract target user and question
  const { targetUserId, question } = parseMessage(text);
  
  if (!targetUserId || !question) {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '❓ I couldn\'t understand that. Try:\n`@Team Agent Bot ask @john what is he working on?`'
    });
    return;
  }
  
  // Get agent data
  const agentData = getAgentData(targetUserId);
  
  if (!agentData) {
    const userInfo = await slack.users.info({ user: targetUserId });
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `😕 @${userInfo.user?.name} hasn't set up their agent yet. They can use \`/setup-agent\` to get started!`
    });
    return;
  }
  
  // Show thinking message
  const thinkingMsg = await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🤔 Asking ${agentData.displayName}'s agent...`
  });
  
  try {
    // Build context for AI
    const context = buildContext(agentData, question);
    
    // Query DeepSeek using Vercel AI SDK
    const { text: answer } = await generateText({
      model: deepseek('deepseek-chat'),
      system: `You are an AI assistant representing ${agentData.displayName}. Answer questions based on the provided data about their work. Be helpful and concise. If you don't have enough information, say so.`,
      prompt: context,
      maxOutputTokens: 300,
      temperature: 0.7
    });
    
    // Calculate sources
    const sources = [];
    if (agentData.data.calendar.length > 0) sources.push('Calendar');
    if (agentData.data.slack.length > 0) sources.push('Slack');
    if (agentData.data.jira.length > 0) sources.push('Jira');
    
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
    
  } catch (error) {
    console.error('Error:', error);
    await slack.chat.update({
      channel,
      ts: thinkingMsg.ts!,
      text: '❌ Sorry, I encountered an error. Please try again.'
    });
  }
}

function parseMessage(text: string): { targetUserId: string | null; question: string } {
  // Extract user mentions - format: <@U12345>
  const mentions = text.match(/<@(U[A-Z0-9]+)>/g);
  
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