import { eventsResponse } from '../lib/events.js';

// Vercel serverless function for GET /api/events?location=…
// Same logic as the local server; the Cache-Control header lets Vercel's CDN cache results.
export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const { status, cacheControl, body } = await eventsResponse(searchParams);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(body));
}
