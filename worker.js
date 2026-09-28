const SPREADSHEET_ID = '1SJU9aCRZGWeAeHw6UfY_08HK8-A34kIlnrEiPJNEnko';
const GID = '1866404435';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai-data') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method !== 'GET') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
      }

      const force = url.searchParams.get('force') === '1';
      const cacheBust = force ? Date.now().toString() : '';
      const attempts = [
        {
          name: 'Google Sheets CSV export',
          url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID}${cacheBust ? `&t=${cacheBust}` : ''}`
        },
        {
          name: 'Google Sheets GViz CSV',
          url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}&tq=select%20*${cacheBust ? `&_ts=${cacheBust}` : ''}`
        }
      ];

      const errors = [];
      for (const attempt of attempts) {
        try {
          const upstream = await fetch(attempt.url, {
            headers: {
              'User-Agent': 'THUY-LOI-AI/12.11',
              'Accept': 'text/csv,text/plain,*/*'
            },
            cf: force ? { cacheTtl: 0, cacheEverything: false } : { cacheTtl: 30, cacheEverything: true }
          });

          const text = await upstream.text();
          if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
          if (!text || !text.trim()) throw new Error('Google trả dữ liệu rỗng.');
          if (/^\s*<(?:!doctype|html)/i.test(text)) throw new Error('Google trả HTML thay vì CSV.');

          return new Response(text, {
            status: 200,
            headers: {
              ...corsHeaders(),
              'Content-Type': 'text/csv; charset=utf-8',
              'Cache-Control': force ? 'no-store' : 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
              'X-AI-DATA-Source': attempt.name
            }
          });
        } catch (error) {
          errors.push(`${attempt.name}: ${String(error?.message || error)}`);
        }
      }

      return json({
        ok: false,
        error: 'Không đọc được AI_DATA từ Google Sheets.',
        detail: errors.join(' | ')
      }, 502);
    }

    return env.ASSETS.fetch(request);
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
