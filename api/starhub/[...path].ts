// File: api/starhub/[...path].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch, { Response } from 'node-fetch';

// User-Agent untuk menghindari 403
const USER_AGENT = 'ExoPlayerDemo/2.15.1 (Linux; Android 13) ExoPlayerLib/2.15.1';

// Base URL CORS-buster
const CORS_BUSTER = 'https://cors-buster.fly.dev/https://ucdn.starhubgo.com';

// Fungsi untuk mem-build URL CORS-buster
function buildCorsUrl(path: string) {
  return `${CORS_BUSTER}${path}`;
}

// Fungsi untuk fetch dengan follow redirect manual
async function fetchWithRedirect(url: string, maxRedirects = 5): Promise<Response> {
  let currentUrl = url;
  let redirects = 0;

  while (redirects < maxRedirects) {
    const res = await fetch(currentUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Forwarded-For': '203.117.83.181'
      },
      redirect: 'manual', // manual untuk handle 302 sendiri
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      // Jika redirect, tetap gunakan CORS-buster
      const location = res.headers.get('location')!;
      currentUrl = buildCorsUrl(new URL(location).pathname);
      redirects++;
    } else {
      return res;
    }
  }

  throw new Error('Too many redirects');
}

// Endpoint handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = '/' + (req.query.path as string[]).join('/');
    const url = buildCorsUrl(path);

    const response = await fetchWithRedirect(url);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.status(response.status).send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
