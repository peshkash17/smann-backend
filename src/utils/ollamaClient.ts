import { Ollama } from 'ollama';
import dotenv from 'dotenv';
dotenv.config();

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'nomic-embed-text';

const client = new Ollama({ host: ollamaHost });

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await client.embed({ model: ollamaModel, input: text });
    return response.embeddings[0];
  } catch {
    // Ollama unavailable — caller will fall back to string similarity
    return null;
  }
}
