require('dotenv').config();
const OpenAI = require('openai');

// Point the OpenAI client at Groq's endpoint
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const systemPrompt = [
  'You are a helpful, general-purpose AI assistant.',
  'Answer questions across a wide range of topics, explain concepts clearly, and adapt your level of detail to what the user asks.',
  'Help with writing, brainstorming, learning, problem-solving, and coding; review code when asked, but do not assume every request is a code review.',
  'Use the conversation history to understand follow-up questions. If a request is ambiguous, ask a brief clarifying question.',
  'Be honest about uncertainty and limitations, and do not claim to have taken actions or accessed information you do not have.',
  'Use clear formatting when it improves readability, without forcing every answer into bullet points.',
].join(' ');

async function generateContent(prompt, history = []) {
  try {
    const response = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...history,
        { role: 'user', content: prompt },
      ],
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Groq API Error:', error);
    throw error;
  }
}

module.exports = { generateContent };