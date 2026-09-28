// api/quantum.js hoặc Cloudflare Worker Handler
export async function onRequest(context) {
  // 1. ID tệp Google Sheet của bạn (thay thế bằng ID thực tế)
  const SHEET_ID = '1YOUR_GOOGLE_SHEET_ID_HERE'; 
  const TAB_NAME = 'Sheet1'; // Tên trang tính
  
  // Đường dẫn lấy CSV công khai từ Google Sheets
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB_NAME)}`;

  // Tạo Header CORS chuẩn để trình duyệt không bị chặn
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=60' // Cache 1 phút tại CDN để tránh quá tải Google Sheet
  };

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Google Sheets HTTP Error: ${response.status}`);
    }

    const csvText = await response.text();
    const data = parseCSV(csvText);

    return new Response(JSON.stringify({ status: 'success', data }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      status: 'error', 
      message: 'Chưa lấy được số liệu quan trắc thực tế.',
      detail: error.message 
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Hàm bổ trợ chuyển đổi dữ liệu CSV từ Google Sheets sang JSON
function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/^"(.*)"$/, '$1').trim());
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const currentline = lines[i].split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
    if (currentline.length === headers.length) {
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentline[j];
      }
      result.push(obj);
    }
  }
  return result;
}
