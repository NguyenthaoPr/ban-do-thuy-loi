const SPREADSHEET_ID = '1SJU9aCRZGWeAeHw6UfY_08HK8-A34kIlnrEiPJNEnko';
const GID = '1866404435';

export default async function handler(req, res) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('gid', GID);
  url.searchParams.set('tq', 'select *');
  try {
    const upstream = await fetch(url.toString(), { headers: { 'User-Agent': 'THUY-LOI-AI/1.0', 'Accept': 'text/csv,text/plain,*/*' } });
    const text = await upstream.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(upstream.status).send(text);
  } catch (error) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ ok:false, error:'Không đọc được AI_DATA từ Google Sheets.', detail:String(error?.message || error) });
  }
}
