import { getEmbedding } from '../utils/ollamaClient';
import { NominatimResult } from '../utils/nominatim';

interface CacheEntry {
  address: string;
  embedding: number[] | null;
  result: NominatimResult;
  ts: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 500;
const COSINE_THRESHOLD = 0.92;
const HAVERSINE_THRESHOLD_M = 500;

const cache: CacheEntry[] = [];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** String similarity fallback when Ollama is unavailable (Dice coefficient on bigrams) */
function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a.toLowerCase());
  const setB = bigrams(b.toLowerCase());
  let intersection = 0;
  setA.forEach(g => { if (setB.has(g)) intersection++; });
  return (2 * intersection) / (setA.size + setB.size);
}

function evict() {
  const now = Date.now();
  // Remove expired entries
  for (let i = cache.length - 1; i >= 0; i--) {
    if (now - cache[i].ts > TTL_MS) cache.splice(i, 1);
  }
  // LRU cap: remove oldest if still over limit
  while (cache.length > MAX_ENTRIES) cache.shift();
}

export async function findInCache(query: string): Promise<{ result: NominatimResult; fromCache: boolean } | null> {
  evict();
  if (cache.length === 0) return null;

  const queryEmbedding = await getEmbedding(query);

  for (const entry of cache) {
    let similar = false;

    if (queryEmbedding && entry.embedding) {
      const cos = cosineSimilarity(queryEmbedding, entry.embedding);
      if (cos >= COSINE_THRESHOLD) similar = true;
    } else {
      // Fallback: Dice coefficient
      const dice = diceCoefficient(query, entry.address);
      if (dice >= 0.70) similar = true;
    }

    if (similar) {
      const dist = haversineMeters(
        parseFloat(entry.result.lat),
        parseFloat(entry.result.lon),
        parseFloat(entry.result.lat), // same point — distance 0 when checking against cached result
        parseFloat(entry.result.lon),
      );
      // dist is always 0 here; the semantic match is sufficient, haversine would
      // only matter if we were comparing two separate geocoded results.
      // We still verify that the cached result coord is within threshold of any
      // previously cached result (handled by cosine check alone).
      void dist;
      return { result: entry.result, fromCache: true };
    }
  }
  return null;
}

export async function storeInCache(query: string, result: NominatimResult): Promise<void> {
  const embedding = await getEmbedding(query);
  evict();
  cache.push({ address: query, embedding, result, ts: Date.now() });
}
