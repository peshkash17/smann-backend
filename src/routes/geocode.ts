import { Router, Request, Response } from 'express';
import { geocode, reverseGeocode, autocomplete } from '../utils/nominatim';
import { findInCache, storeInCache } from '../cache/semanticCache';
import { PLANNED_ROUTE } from '../simulator/agentSimulator';

const router = Router();

/**
 * Build progressively simpler fallback queries from a detailed address string.
 * e.g. "Plot No 293, CIDCO Waluj Mahanagar 1, Chhatrapati Sambhajinagar, Maharashtra"
 *   → "CIDCO Waluj Mahanagar 1, Chhatrapati Sambhajinagar, Maharashtra"
 *   → "Waluj Mahanagar, Chhatrapati Sambhajinagar, Maharashtra"
 *   → "Waluj, Chhatrapati Sambhajinagar, Maharashtra"
 *   → "Chhatrapati Sambhajinagar, Maharashtra"
 */
function buildFallbackQueries(q: string): string[] {
  const variants: string[] = [];
  const parts = q.split(',').map(s => s.trim()).filter(Boolean);

  // Strip leading plot/flat/house/shop/door/survey/gat number parts
  const plotPattern = /^(plot\s*(no\.?\s*)?\d+|flat\s*(no\.?\s*)?\d+|house\s*(no\.?\s*)?\d+|shop\s*(no\.?\s*)?\d+|door\s*(no\.?\s*)?\d+|s\.?\s*no\.?\s*\d+|gat\s*(no\.?\s*)?\d+|\d+[/\-]\d+|\d+[a-z]?)$/i;

  // Progressively drop leading parts if they look like unit numbers
  let start = 0;
  while (start < parts.length - 1 && plotPattern.test(parts[start])) {
    start++;
    const candidate = parts.slice(start).join(', ');
    if (candidate) variants.push(candidate);
  }

  // Also try dropping the first part unconditionally (handles "CIDCO Waluj Mahanagar 1")
  if (parts.length > 2) {
    variants.push(parts.slice(1).join(', '));
  }
  if (parts.length > 3) {
    variants.push(parts.slice(2).join(', '));
  }
  if (parts.length > 1) {
    // Last two parts (city + state)
    variants.push(parts.slice(-2).join(', '));
  }

  // Deduplicate while preserving order, excluding the original
  const seen = new Set<string>([q.toLowerCase()]);
  return variants.filter(v => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** GET /geocode?q=Pune Railway Station */
router.get('/geocode', async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string || '').trim();
  if (!q) { res.status(400).json({ error: 'q is required' }); return; }

  // Check semantic cache first
  const cached = await findInCache(q);
  if (cached) {
    console.log(`[cache] HIT for: "${q}"`);
    res.json({ ...cached.result, fromCache: true });
    return;
  }

  // Try the exact query first
  let result = await geocode(q);
  let resolvedQuery = q;

  // If not found, try progressively simplified fallbacks
  if (!result) {
    const fallbacks = buildFallbackQueries(q);
    console.log(`[geocode] "${q}" not found — trying ${fallbacks.length} fallbacks`);
    for (const fb of fallbacks) {
      result = await geocode(fb);
      if (result) {
        console.log(`[geocode] resolved via fallback: "${fb}"`);
        resolvedQuery = fb;
        break;
      }
    }
  }

  if (!result) {
    res.status(404).json({
      error: 'Address not found. OSM map data may not have this plot/building. Try a nearby landmark or just the area name.',
    });
    return;
  }

  await storeInCache(q, result);
  res.json({ ...result, fromCache: false, resolvedQuery: resolvedQuery !== q ? resolvedQuery : undefined });
});

/** GET /reverse?lat=18.53&lon=73.84 */
router.get('/reverse', async (req: Request, res: Response): Promise<void> => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  if (isNaN(lat) || isNaN(lon)) { res.status(400).json({ error: 'lat and lon are required' }); return; }

  console.log(`[reverse] lat=${lat} lon=${lon}`);
  const result = await reverseGeocode(lat, lon);
  if (!result) {
    res.status(404).json({ error: `No address found for coordinates (${lat}, ${lon}). The location may be outside OSM coverage.` });
    return;
  }
  res.json(result);
});

/** GET /autocomplete?q=Shivajinagar */
router.get('/autocomplete', async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string || '').trim();
  if (q.length < 2) { res.json([]); return; }

  const results = await autocomplete(q);
  
  // Filter out results with insufficient detail (e.g., just country or state names)
  // Keep only results with at least 2 commas (indicating 3+ levels of detail)
  const filtered = results.filter(r => {
    const commaCount = (r.display_name.match(/,/g) || []).length;
    return commaCount >= 2;
  });
  
  res.json(filtered);
});

/** GET /route — planned delivery route waypoints */
router.get('/route', (_req: Request, res: Response): void => {
  res.json(PLANNED_ROUTE);
});

export default router;
