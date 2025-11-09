import type { VercelRequest, VercelResponse } from '@vercel/node';

// Base URL tujuan (CORS buster + domain Starhub)
const UPSTREAM_BASE = 'https://cors-buster.fly.dev/https://ucdn.starhubgo.com';
// Domain asli Starhub untuk keperluan pengecekan dan penggantian redirect
const STARHUB_DOMAIN = 'https://ucdn.starhubgo.com';

// Daftar header yang merupakan 'hop-by-hop' dan tidak boleh disalin ke respons klien.
const HOP_BY_HOP_HEADERS = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'host'
];

/**
 * Fungsi proxy Vercel yang meneruskan permintaan ke URL Starhub melalui CORS Buster.
 * Fungsi ini menangani path dinamis ([...path]).
 * * @param req Objek permintaan Vercel yang berisi data permintaan klien.
 * @param res Objek respons Vercel untuk mengirim balasan kembali ke klien.
 */
export default async function (req: VercelRequest, res: VercelResponse) {
    const { method, headers, url } = req;

    // 1. Dapatkan path (dari dynamic route) dan query string dari permintaan klien
    // `req.query.path` akan berisi segmen path setelah `/api/starhub/`
    const pathSegments = Array.isArray(req.query.path) 
        ? req.query.path 
        : [req.query.path].filter(Boolean);
    const path = pathSegments.join('/');

    // VercelRequest.url hanya berisi path dari Vercel, kita perlu search/query dari URL lengkap
    // Kita buat URL objek dari URL klien yang lengkap untuk mendapatkan query string
    const clientUrl = new URL(url || '/', `http://${headers.host}`);
    const queryString = clientUrl.search;

    // 2. Bentuk URL upstream lengkap
    const targetUrl = `${UPSTREAM_BASE}/${path}${queryString}`;

    try {
        // 3. Siapkan header untuk permintaan upstream
        const upstreamHeaders = new Headers();

        // Salin header dari client, kecuali header hop-by-hop
        for (const [key, value] of Object.entries(headers)) {
            if (value && !HOP_BY-HOP_HEADERS.includes(key.toLowerCase())) {
                const headerValue = Array.isArray(value) ? value.join(', ') : value;
                upstreamHeaders.set(key, headerValue);
            }
        }

        // Terapkan header wajib (Syarat 2)
        upstreamHeaders.set('User-Agent', 'ExoPlayerDemo/2.15.1 (Linux; Android 13) ExoPlayerLib/2.15.1');
        upstreamHeaders.set('X-Forwarded-For', '203.117.83.181');

        // Untuk metode non-GET/HEAD, tambahkan body
        let body: any = undefined;
        if (method !== 'GET' && method !== 'HEAD') {
            body = (req as any).body;
        }

        // 4. Lakukan fetch ke upstream dengan redirect: 'manual' (Syarat 3: Jangan mengikuti redirect otomatis)
        const upstreamResponse = await fetch(targetUrl, {
            method,
            headers: upstreamHeaders,
            body: body,
            redirect: 'manual', 
        });

        // 5. Salin status code dari upstream
        res.status(upstreamResponse.status);

        // 6. Salin header non-hop-by-hop dari upstream ke respons client (Syarat 4)
        upstreamResponse.headers.forEach((value, key) => {
            if (!HOP_BY-HOP_HEADERS.includes(key.toLowerCase())) {
                let finalValue = value;

                // Penanganan Redirect (Syarat 3: Ubah Location)
                if ((upstreamResponse.status === 301 || upstreamResponse.status === 302) && key.toLowerCase() === 'location') {
                    
                    // Cek apakah Location mengarah ke STARHUB_DOMAIN
                    if (value.startsWith(STARHUB_DOMAIN)) {
                        // Ganti STARHUB_DOMAIN dengan UPSTREAM_BASE sesuai permintaan.
                        // Ini memastikan redirect berikutnya tetap melewati CORS-buster.
                        finalValue = value.replace(STARHUB_DOMAIN, UPSTREAM_BASE);
                    }
                    
                    // Jika Anda ingin redirect kembali ke endpoint Vercel Anda sendiri
                    // (yang merupakan praktik proxy yang lebih umum), gunakan:
                    // const redirectPath = value.replace(STARHUB_DOMAIN, '').replace('//', '/');
                    // finalValue = `/starhub${redirectPath}`;
                }
                
                res.setHeader(key, finalValue);
            }
        });

        // 7. Salin body respons
        // Gunakan upstreamResponse.body.pipe(res) untuk streaming efisien jika menggunakan runtime Node.
        // Untuk VercelResponse, menggunakan .send(await .buffer()) lebih aman
        
        // Cek jika ada body yang bisa dibaca (misalnya bukan 204 atau 304)
        if (upstreamResponse.body) {
            const bodyContent = await upstreamResponse.buffer();
            res.send(bodyContent);
        } else {
            res.end();
        }

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).send(`Proxy Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}
