import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

const client = apiKey ? new OpenAI({ apiKey }) : null;

export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!client) return null; // No API key — caller falls back to string similarity
  try {
    const response = await client.embeddings.create({ model, input: text });
    return response.data[0].embedding;
  } catch {
    // OpenAI unavailable — caller will fall back to string similarity
    return null;
  }
}
