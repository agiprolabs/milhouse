import Anthropic from '@anthropic-ai/sdk';

// For embeddings, we'll use a simple approach:
// 1. Use Claude to generate a summary/keywords
// 2. Create a simple hash-based embedding for similarity
// This avoids needing a separate OpenAI key while still being functional

// In production, you might want to use:
// - OpenAI's text-embedding-3-small
// - Voyage AI (Anthropic's recommended partner)
// - A local model like sentence-transformers

const EMBEDDING_DIM = 1536;

// Simple hash function for text
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// Generate a deterministic pseudo-embedding based on text content
// This is a placeholder - for production, use a real embedding model
function generateSimpleEmbedding(text: string): number[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const embedding = new Array(EMBEDDING_DIM).fill(0);

  // Create embedding based on word hashes
  words.forEach((word, idx) => {
    const hash = hashString(word);
    const position = Math.abs(hash) % EMBEDDING_DIM;
    embedding[position] += 1 / (idx + 1); // Weight earlier words more
  });

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

// Environment variable for OpenAI API key (optional, for better embeddings)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function generateEmbedding(text: string): Promise<number[]> {
  // If OpenAI key is available, use their embeddings API
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.substring(0, 8000), // Limit input size
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.data[0].embedding;
      }
    } catch (error) {
      console.error('OpenAI embedding failed, falling back to simple embedding:', error);
    }
  }

  // Fallback to simple embedding
  return generateSimpleEmbedding(text);
}

// Use Claude to generate a summary for better semantic matching
const anthropic = new Anthropic();

export async function generateSummary(text: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Summarize the following text in 2-3 sentences, focusing on the key topics, decisions, and technical details:\n\n${text.substring(0, 4000)}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
  } catch (error) {
    console.error('Failed to generate summary:', error);
  }

  // Fallback: return first 500 chars
  return text.substring(0, 500);
}
