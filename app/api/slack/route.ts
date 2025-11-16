// app/api/slack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { getAgentData } from '@/lib/demo-data';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  
  // Check content type - Slack sends slash commands as form data, events as JSON
  const contentType = request.headers.get('content-type') || '';
  
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Parse form data for slash commands
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
  } else {
    // Parse JSON for events and URL verification
    try {
      body = await request.json() as Record<string, unknown>;
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  }
  
  // Handle Slack URL verification
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }
  
  // Handle slash command
  if (body.command === '/setup-agent') {
    await handleSetupCommand({
      user_id: String(body.user_id || ''),
      channel_id: String(body.channel_id || '')
    });
    return NextResponse.json({ ok: true });
  }
  
  // Handle app mention
  if (body.event && typeof body.event === 'object' && 'type' in body.event && body.event.type === 'app_mention') {
    const event = body.event as unknown as { text: string; channel: string; ts: string };
    // Process async (don't make Slack wait)
    handleAppMention(event).catch(console.error);
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
    
    // Truncate answer if too long (Slack section text limit is 3000 chars)
    // Reserve space for header and formatting
    const maxAnswerLength = 2500;
    const truncatedAnswer = answer.length > maxAnswerLength 
      ? answer.substring(0, maxAnswerLength) + '...'
      : answer;
    
    // Escape markdown special characters that might break the block
    // Slack markdown is sensitive to triple backticks and code blocks
    const escapedAnswer = truncatedAnswer
      .replace(/```[\s\S]*?```/g, (match) => {
        // Replace code blocks with inline code
        const content = match.replace(/```/g, '').trim();
        return `\`${content}\``;
      })
      .replace(/```/g, '`') // Replace any remaining triple backticks
      .substring(0, 2500); // Ensure we don't exceed limits
    
    const sectionText = `🤖 *${agentData.displayName}'s Agent:*\n\n${escapedAnswer}`;
    const sourcesText = sources.length > 0 
      ? `📊 Demo Mode | 📎 Sources: ${sources.join(', ')}`
      : '📊 Demo Mode';
    
    // Update message with answer - try blocks first, fallback to plain text
    try {
      await slack.chat.update({
        channel,
        ts: thinkingMsg.ts!,
        text: truncatedAnswer, // Fallback plain text
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: sectionText.substring(0, 3000) // Ensure within Slack limit
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: sourcesText.substring(0, 2000) // Context block limit
              }
            ]
          }
        ]
      });
    } catch (blockError) {
      // If blocks fail, fallback to plain text
      console.error('Block update failed, using plain text:', blockError);
      await slack.chat.update({
        channel,
        ts: thinkingMsg.ts!,
        text: `🤖 ${agentData.displayName}'s Agent:\n\n${truncatedAnswer}\n\n${sourcesText}`
      });
    }
    
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