const SPREADSHEET_ID = '1SJU9aCRZGWeAeHw6UfY_08HK8-A34kIlnrEiPJNEnko';
const GID = '1866404435';
const SHEET = 'AI_DATA';
const RANGE = 'AI_DATA!A:K';
const CACHE_TTL = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai-data') {
      return handleAiDataProxy(request, url);
    }
    if (url.pathname === '/api/live') {
      return handleLive(request, url);
    }
    if (url.pathname === '/api/chart') {
      return handleChart(request, url);
    }
    if (url.pathname === '/api/ai-data-debug') {
      return handleDebug(request, url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleAiDataProxy(request, url) {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:corsHeaders()});
  if (request.method !== 'GET') return json({ok:false,error:'Method not allowed'},405);
  const force=url.searchParams.get('force')==='1';
  try {
    const {text,source}=await fetchSheetCsv(force);
    return new Response(text,{status:200,headers:{...corsHeaders(),'Content-Type':'text/csv; charset=utf-8','Cache-Control':force?'no-store':`public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}, stale-while-revalidate=60`,'X-AI-DATA-Source':source}});
  } catch(error) {
    return json({ok:false,error:'Không đọc được AI_DATA từ Google Sheets.',detail:String(error?.message||error)},502);
  }
}

async function handleLive(request,url) {
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders()});
  const facility=cleanName(url.searchParams.get('facility')||'');
  const code=norm(url.searchParams.get('code')||'');
  const year=Number(url.searchParams.get('year'))||new Date().getFullYear();
  const force=url.searchParams.get('fresh')==='1';
  if(!facility && !code) return json({ok:false,error:'Thiếu facility.'},400);
  try {
    const rows=await readAiRows(force);
    const resolved=resolveFacilityRows(rows,facility,code);
    if(!resolved.rows.length) {
      return json({ok:false,source:'google_sheets',code:'NO_MATCH',error:`Không tìm thấy công trình "${facility}" trong AI_DATA.`,debug:{requested_facility:facility,requested_code:code,available_names:resolved.names.slice(0,80),row_count:rows.length}},404);
    }
    const parsed=resolved.rows.map(r=>parseObservation(r,year)).filter(Boolean);
    const waterCandidates=parsed.filter(x=>['WATER_LEVEL','WATER_LEVEL_UPSTREAM','WATER_LEVEL_DOWNSTREAM'].includes(x.code));
    const rainCandidates=parsed.filter(x=>['RAINFALL','RAINFALL_T1','RAINFALL_C24'].includes(x.code));
    const flowCandidates=parsed.filter(x=>x.code==='FLOW');
    const salCandidates=parsed.filter(x=>x.code==='SALINITY');
    const water=pickLatestWater(waterCandidates);
    const rainfall=pickLatestPriority(rainCandidates,['RAINFALL','RAINFALL_T1','RAINFALL_C24']);
    const flow=latest(flowCandidates);
    const salinity=latest(salCandidates);
    if(!water && !rainfall && !flow && !salinity) {
      return json({ok:false,source:'google_sheets',code:'NO_VALID_DATA',error:`Công trình "${resolved.canonical}" đã khớp nhưng chưa có thông số quan trắc hợp lệ.`,debug:{requested_facility:facility,canonical:resolved.canonical,match_method:resolved.method,parameters:[...new Set(parsed.map(x=>x.parameter).filter(Boolean))].slice(0,80),row_count:resolved.rows.length}},404);
    }
    const latestOverall=parsed.reduce((a,b)=>!a||b.time>a.time?b:a,null);
    const limits=extractLimits(resolved.rows);
    const status=buildStatus(water,limits);
    return json({ok:true,data:{
      water_level:cleanItem(water), rainfall:cleanItem(rainfall), flow:cleanItem(flow), salinity:cleanItem(salinity),
      limits, status,
      updated_label:latestOverall?formatDate(latestOverall.time):'AI_DATA',
      source:'AI_DATA • Google Sheets • Technical Resolver',
      facility:resolved.canonical, requested_facility:facility, match_method:resolved.method,
      parameters:[...new Set(parsed.map(x=>x.parameter).filter(Boolean))].sort()
    },debug:{requested_facility:facility,canonical:resolved.canonical,match_method:resolved.method,row_count:resolved.rows.length}},200);
  } catch(error) { return json({ok:false,source:'google_sheets',error:String(error?.message||error)},502); }
}

async function handleChart(request,url) {
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders()});
  const facility=cleanName(url.searchParams.get('facility')||'');
  const code=norm(url.searchParams.get('code')||'');
  const year=Number(url.searchParams.get('year'))||new Date().getFullYear();
  const days=Math.max(1,Math.min(31,Number(url.searchParams.get('days'))||7));
  try {
    const rows=await readAiRows(false);
    const resolved=resolveFacilityRows(rows,facility,code);
    if(!resolved.rows.length) return json({ok:false,code:'NO_MATCH',error:'Không tìm thấy công trình trong AI_DATA.',debug:{requested_facility:facility,available_names:resolved.names.slice(0,80)}},404);
    const obs=resolved.rows.map(r=>parseObservation(r,year)).filter(x=>x&&['WATER_LEVEL_UPSTREAM','WATER_LEVEL','WATER_LEVEL_DOWNSTREAM'].includes(x.code));
    if(!obs.length) return json({ok:true,data:{water:[],waterParameter:null,facility:resolved.canonical,match_method:resolved.method}},200);
    const preferred=obs.some(x=>x.code==='WATER_LEVEL_UPSTREAM')?'WATER_LEVEL_UPSTREAM':obs.some(x=>x.code==='WATER_LEVEL')?'WATER_LEVEL':'WATER_LEVEL_DOWNSTREAM';
    const latestTime=obs.reduce((a,b)=>!a||b.time>a?b.time:a,null);
    const cutoff=latestTime?new Date(latestTime.getTime()-days*86400000):null;
    const points=obs.filter(x=>x.code===preferred&&(!cutoff||x.time>=cutoff)).sort((a,b)=>a.time-b.time).slice(-1000).map(x=>({time:x.time.toISOString(),value:x.value}));
    return json({ok:true,data:{water:points,waterParameter:preferred,facility:resolved.canonical,match_method:resolved.method}},200);
  } catch(error) { return json({ok:false,error:String(error?.message||error)},502); }
}

async function handleDebug(request,url) {
  try {
    const facility=cleanName(url.searchParams.get('facility')||'');
    const rows=await readAiRows(true);
    const resolved=resolveFacilityRows(rows,facility,norm(url.searchParams.get('code')||''));
    return json({ok:true,rows:rows.length,headers:AI_HEADERS,requested_facility:facility,canonical:resolved.canonical,match_method:resolved.method,matched_rows:resolved.rows.length,available_names:resolved.names.slice(0,200),sample_matches:resolved.rows.slice(0,20).map(r=>({facility:r[4],parameter:r[7]||r[6],value:r[8],month:r[0],day:r[1],hour:r[2]}))},200);
  } catch(error) { return json({ok:false,error:String(error?.message||error)},502); }
}

const AI_HEADERS=['Tháng','Ngày','Giờ','Đơn vị','Công trình','Hạng mục','Thông số','Thông số (Đơn vị đo)','Giá trị','Cột nguồn','Nguồn dữ liệu'];

async function readAiRows(force=false) {
  const {text}=await fetchSheetCsv(force);
  const rows=parseCSV(text);
  if(rows.length<2) throw new Error('AI_DATA không có dữ liệu.');
  const header=rows[0].map(x=>cleanName(x));
  const normalized=header.map(norm);
  const required=['thang','ngay','gio','don vi','cong trinh','hang muc','thong so','thong so don vi do','gia tri'];
  const matches=required.filter((x,i)=>normalized[i]===x).length;
  if(matches<6) throw new Error(`Header AI_DATA không đúng cấu trúc A:K. Header=${JSON.stringify(header.slice(0,11))}`);
  return rows.slice(1).map(r=>{const a=Array(11).fill('');for(let i=0;i<Math.min(11,r.length);i++)a[i]=r[i];return a;}).filter(r=>cleanName(r[4]));
}

async function fetchSheetCsv(force=false) {
  const bust=force?`&t=${Date.now()}`:'';
  const attempts=[
    {name:'Google Sheets CSV export',url:`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID}${bust}`},
    {name:'Google Sheets GViz CSV',url:`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}&tq=select%20*${force?`&_ts=${Date.now()}`:''}`}
  ];
  const errors=[];
  for(const a of attempts){
    try{
      const r=await fetch(a.url,{headers:{'User-Agent':'Mozilla/5.0 THUY-LOI-AI/12.12','Accept':'text/csv,text/plain,*/*'},cf:force?{cacheTtl:0,cacheEverything:false}:{cacheTtl:CACHE_TTL,cacheEverything:true}});
      const text=await r.text();
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      if(!text.trim()) throw new Error('Google trả dữ liệu rỗng.');
      if(/^\s*<(?:!doctype|html)/i.test(text)) throw new Error('Google trả HTML thay vì CSV.');
      return {text,source:a.name};
    }catch(e){errors.push(`${a.name}: ${String(e?.message||e)}`);}
  }
  throw new Error(errors.join(' | '));
}

function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()!==''))rows.push(row);row=[];}else cell+=c;}if(cell!==''||row.length){row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row);}return rows;}
function cleanName(v){return String(v??'').replace(/\ufeff/g,'').replace(/[\u00a0\u2007\u202f]/g,' ').replace(/\s+/g,' ').trim();}
function norm(v){return cleanName(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
// Dùng riêng cho matching tên công trình: bỏ mã trong (...) / [...] nhưng KHÔNG đổi tên hiển thị.
function normalizeFacilityName(v){
  return norm(cleanName(v).replace(/\([^)]*\)/g,' ').replace(/\[[^\]]*\]/g,' '));
}
function num(v){if(v==null||v==='')return null;let s=String(v).trim().replace(/\s/g,'').replace('−','-');if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(s.includes(','))s=s.replace(',','.');const m=s.match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):null;}
const CODE_RE=/(?:\(|\[)\s*([A-Za-zÀ-ỹĐđ0-9][A-Za-zÀ-ỹĐđ0-9._-]{0,15})\s*(?:\)|\])/i;
const PREFIXES=['ho chua nuoc','ho chua','ho','tram bom','tram','dap','cong','kenh'];
function facilityCode(v){const m=CODE_RE.exec(cleanName(v));return m?norm(m[1]):'';}
function facilityCore(v){
  let n=normalizeFacilityName(v);
  for(const p of PREFIXES){if(n.startsWith(p+' ')){n=n.slice(p.length).trim();break;}}
  return n.replace(/\s+/g,' ').trim();
}
function facilityScore(req,cand){
  const a=normalizeFacilityName(req), b=normalizeFacilityName(cand);
  if(!a||!b)return 0;
  // Ưu tiên tên lõi sau khi bỏ mã: Hồ Vĩnh Trinh == Hồ Vĩnh Trinh (H3).
  if(a===b)return 100;
  const ac=facilityCode(req), bc=facilityCode(cand);
  if(ac&&bc&&ac===bc)return 98;
  const ar=facilityCore(req), br=facilityCore(cand);
  if(ar&&br&&ar===br)return 90;
  return 0;
}
function resolveFacilityRows(rows,requested,requestedCode=''){
  const data=Array.isArray(rows)?rows:[];
  const names=[],seen=new Set();
  for(const r of data){
    const n=cleanName(r[4]);
    const k=normalizeFacilityName(n);
    if(n&&!seen.has(k)){seen.add(k);names.push(n);}
  }
  let best='',score=0;
  for(const n of names){
    const s=facilityScore(requested,n);
    const codeMatch=requestedCode&&facilityCode(n)===requestedCode;
    const total=s+(codeMatch?2:0);
    if(total>score){score=total;best=n;}
  }
  // Nếu không có tên nhưng có mã công trình, thử mã độc lập.
  if(!best&&requestedCode){
    best=names.find(n=>facilityCode(n)===requestedCode)||'';
    if(best)score=98;
  }
  const bestKey=normalizeFacilityName(best);
  const matched=bestKey?data.filter(r=>normalizeFacilityName(r[4])===bestKey):[];
  const method=score>=102?'exact+code':score>=100?'exact':score>=98?'code':score>=90?'core':'none';
  return {rows:matched,canonical:best,method,names,normalized_requested:normalizeFacilityName(requested),normalized_canonical:bestKey,score};
}
function parameterName(r){return cleanName(r[7]||r[6]);}
function classify(p){const n=norm(p);if(/(^|\s)htl(\s|$)/.test(n)||n.includes('muc nuoc thuong luu'))return 'WATER_LEVEL_UPSTREAM';if(/(^|\s)hhl(\s|$)/.test(n)||n.includes('muc nuoc ha luu'))return 'WATER_LEVEL_DOWNSTREAM';if(/(^|\s)(h|muc nuoc|muc nuoc ho|water level|waterlevel|z)(\s|$)/.test(n))return 'WATER_LEVEL';if(/(^|\s)(x c24|mua c24|rainfall c24)(\s|$)/.test(n))return 'RAINFALL_C24';if(/(^|\s)(x t1|mua t1|rainfall t1)(\s|$)/.test(n))return 'RAINFALL_T1';if(/(^|\s)(x|mua|luong mua|rainfall|rain|precipitation)(\s|$)/.test(n))return 'RAINFALL';if(n.includes('luu luong')||n.includes('flow')||n.includes('discharge')||/^q(?:\s|$)/.test(n))return 'FLOW';if(n.includes('do man')||n.includes('salinity')||/^man(?:\s|$)/.test(n))return 'SALINITY';return null;}
function parseObservation(r,year){const month=num(r[0]),day=num(r[1]),hourRaw=cleanName(r[2]);if(!Number.isFinite(month)||!Number.isFinite(day))return null;let hour=0,minute=0,second=0;const hm=hourRaw.match(/^(\d{1,2})[:h](\d{1,2})(?::(\d{1,2}))?/i);if(hm){hour=Number(hm[1]);minute=Number(hm[2]);second=Number(hm[3]||0);}else{const hn=num(hourRaw);if(Number.isFinite(hn)){hour=Math.floor(hn);minute=Math.round((hn-hour)*60);}}const dt=new Date(year,month-1,day,hour,minute,second);const value=num(r[8]);const parameter=parameterName(r);const code=classify(parameter);if(!Number.isFinite(dt.getTime())||!parameter||!Number.isFinite(value)||!code)return null;return {parameter,code,value,time:dt,unit:extractUnit(parameter)};}
function extractUnit(p){const m=String(p).match(/\(([^)]+)\)/);return m?m[1].trim():'';}
function latest(arr){return arr.length?arr.reduce((a,b)=>!a||b.time>a.time?b:a,null):null;}
function pickLatestPriority(arr,priorities){for(const p of priorities){const c=arr.filter(x=>x.code===p);if(c.length)return latest(c);}return null;}
function pickLatestWater(arr){return pickLatestPriority(arr,['WATER_LEVEL_UPSTREAM','WATER_LEVEL','WATER_LEVEL_DOWNSTREAM']);}
function cleanItem(x){return x?{parameter:x.parameter,code:x.code,value:x.value,time:x.time.toISOString(),unit:x.unit||''}:null;}
function extractLabel(text,label){const s=cleanName(text);const m=s.match(new RegExp(label+'\\s*[:=]?\\s*([-+]?\\d+(?:[.,]\\d+)?)','i'));return m?num(m[1]):null;}
function extractLimits(rows){let mndbt=null,mndgc=null;for(const r of rows){for(const idx of [5,6,4,7]){if(mndbt==null)mndbt=extractLabel(r[idx],'MNDBT');if(mndgc==null)mndgc=extractLabel(r[idx],'MNDGC');}}return {MNDBT:mndbt,MNDGC:mndgc};}
function buildStatus(water,limits){const h=water?.value,b=limits.MNDBT,c=limits.MNDGC;if(h==null)return {level:'info',label:'Chưa có dữ liệu mực nước',message:'Chưa tìm thấy mực nước hợp lệ trong AI_DATA.'};if(c!=null&&h>c)return {level:'danger',label:'Mực nước vượt MNDGC',message:`Mực nước ${h} m, cao hơn MNDGC ${c} m.`};if(b!=null&&h>=b)return {level:'warning',label:'Mực nước từ MNDBT trở lên',message:`Mực nước ${h} m, MNDBT ${b} m.`};if(b!=null)return {level:'normal',label:'Mực nước dưới MNDBT',message:`Mực nước ${h} m, MNDBT ${b} m.`};return {level:'normal',label:'Có dữ liệu quan trắc mới nhất',message:'Đã đọc được số liệu quan trắc mới nhất từ AI_DATA.'};}
function formatDate(d){return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}
function corsHeaders(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders(),'Content-Type':'application/json; charset=utf-8'}});}
