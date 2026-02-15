import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

// GET /api/discover/trending
router.get('/trending', async (req, res) => {
  const country = (req.query.country as string) || 'US';
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  const result = await query(
    `SELECT c.id, c.title, c.content_type, c.year, c.poster_url,
            c.overview, c.genres, c.rating, c.popularity,
            json_agg(json_build_object(
              'platformId', ca.platform_id,
              'platformName', p.name,
              'platformLogo', p.logo_url,
              'deepLink', ca.deep_link
            )) as platforms
     FROM content c
     JOIN content_availability ca ON ca.content_id = c.id
     JOIN platforms p ON p.id = ca.platform_id AND p.active = true
     WHERE ca.country_code = $1
       AND (ca.available_until IS NULL OR ca.available_until >= CURRENT_DATE)
     GROUP BY c.id
     ORDER BY c.popularity DESC
     LIMIT $2`,
    [country, limit],
  );

  res.json({ trending: result.rows, country, count: result.rows.length });
});

// GET /api/discover/top
router.get('/top', async (req, res) => {
  const country = (req.query.country as string) || 'US';

  // Top 10 based on actual viewing time on TimeVision
  const result = await query(
    `SELECT c.id, c.title, c.content_type, c.poster_url, c.rating,
            COUNT(vs.id) as session_count,
            SUM(vs.duration_sec) as total_seconds,
            json_agg(DISTINCT jsonb_build_object(
              'platformId', p.id,
              'platformName', p.name
            )) as platforms
     FROM viewing_sessions vs
     JOIN content c ON c.tmdb_id = vs.content_id
     JOIN content_availability ca ON ca.content_id = c.id AND ca.country_code = $1
     JOIN platforms p ON p.id = vs.platform_id
     WHERE vs.started_at >= NOW() - INTERVAL '7 days'
       AND vs.is_valid = true
     GROUP BY c.id
     ORDER BY total_seconds DESC
     LIMIT 10`,
    [country],
  );

  res.json({ top10: result.rows, period: '7days', country });
});

// GET /api/discover/search
router.get('/search', async (req, res) => {
  const q = req.query.q as string;
  const country = (req.query.country as string) || 'US';

  if (!q || q.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }

  const result = await query(
    `SELECT c.id, c.title, c.content_type, c.year, c.poster_url,
            c.rating, c.genres,
            json_agg(json_build_object(
              'platformId', ca.platform_id,
              'platformName', p.name,
              'deepLink', ca.deep_link
            )) as platforms
     FROM content c
     JOIN content_availability ca ON ca.content_id = c.id
     JOIN platforms p ON p.id = ca.platform_id AND p.active = true
     WHERE ca.country_code = $1
       AND (c.title ILIKE $2 OR c.original_title ILIKE $2)
     GROUP BY c.id
     ORDER BY c.popularity DESC
     LIMIT 20`,
    [country, `%${q}%`],
  );

  res.json({ results: result.rows, query: q, count: result.rows.length });
});

// GET /api/discover/platform/:id
router.get('/platform/:id', async (req, res) => {
  const platformId = parseInt(req.params.id, 10);
  const country = (req.query.country as string) || 'US';

  const platform = await query(
    'SELECT id, name, slug, description, logo_url, base_url FROM platforms WHERE id = $1 AND active = true',
    [platformId],
  );

  if (platform.rows.length === 0) {
    res.status(404).json({ error: 'Platform not found' });
    return;
  }

  const content = await query(
    `SELECT c.id, c.title, c.content_type, c.year, c.poster_url,
            c.rating, ca.deep_link
     FROM content c
     JOIN content_availability ca ON ca.content_id = c.id
     WHERE ca.platform_id = $1 AND ca.country_code = $2
     ORDER BY c.popularity DESC
     LIMIT 50`,
    [platformId, country],
  );

  res.json({ platform: platform.rows[0], content: content.rows });
});

export const discoverRoutes = router;
