import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const ROOT = process.cwd();
const kmzPath = path.join(ROOT, 'gis_master', 'master.kmz');
const outPath = path.join(ROOT, 'gis', 'master.geojson');
const NS = 'http://www.opengis.net/kml/2.2';

function childrenByTag(node, tag) {
  const all = node?.getElementsByTagName?.(tag) || [];
  return Array.from(all);
}
function directChild(node, tag) {
  for (const c of Array.from(node?.childNodes || [])) {
    if (c.nodeType === 1 && (c.localName === tag || c.nodeName === tag || c.nodeName.endsWith(':' + tag))) return c;
  }
  return null;
}
function text(node, tag) {
  const el = directChild(node, tag) || childrenByTag(node, tag)[0];
  return el?.textContent?.trim() || '';
}
function coordinates(raw) {
  const out = [];
  for (const token of String(raw || '').trim().split(/\s+/)) {
    if (!token) continue;
    const a = token.split(',');
    if (a.length < 2) continue;
    const x = Number(a[0]), y = Number(a[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const z = a.length > 2 && a[2] !== '' ? Number(a[2]) : null;
    out.push(z != null && Number.isFinite(z) ? [x,y,z] : [x,y]);
  }
  return out;
}
function geometry(node) {
  if (!node) return null;
  const tag = node.localName || node.nodeName.split(':').pop();
  if (tag === 'Point') {
    const c = coordinates(text(node, 'coordinates'));
    return c.length ? {type:'Point', coordinates:c[0]} : {type:'Point', coordinates:[]};
  }
  if (tag === 'LineString') return {type:'LineString', coordinates:coordinates(text(node,'coordinates'))};
  if (tag === 'Polygon') {
    const outer = childrenByTag(node,'outerBoundaryIs')[0];
    const outerRing = outer ? childrenByTag(outer,'LinearRing')[0] : null;
    const inner = childrenByTag(node,'innerBoundaryIs');
    return {
      type:'Polygon',
      coordinates:[
        outerRing ? coordinates(text(outerRing,'coordinates')) : [],
        ...inner.map(b => { const r=childrenByTag(b,'LinearRing')[0]; return r ? coordinates(text(r,'coordinates')) : []; })
      ]
    };
  }
  if (tag === 'MultiGeometry') {
    const gs=[];
    for (const c of Array.from(node.childNodes || [])) {
      if (c.nodeType !== 1) continue;
      const ct=c.localName || c.nodeName.split(':').pop();
      if (['Point','LineString','Polygon','MultiGeometry'].includes(ct)) {
        const g=geometry(c); if (g) gs.push(g);
      }
    }
    return {type:'GeometryCollection', geometries:gs};
  }
  return null;
}
function styleProps(style) {
  const p={};
  if (!style) return p;
  const line=childrenByTag(style,'LineStyle')[0];
  const poly=childrenByTag(style,'PolyStyle')[0];
  const icon=childrenByTag(style,'IconStyle')[0];
  if (line) {
    const c=text(line,'color'), w=text(line,'width');
    if (c) p.KMLColor=c;
    if (w && Number.isFinite(Number(w))) p.KMLWidth=Number(w);
  }
  if (poly) {
    const c=text(poly,'color'), fill=text(poly,'fill'), outline=text(poly,'outline');
    if (c) p.KMLPolyColor=c;
    if (fill && Number.isFinite(Number(fill))) p.KMLPolyFill=Number(fill);
    if (outline && Number.isFinite(Number(outline))) p.KMLOutline=Number(outline);
  }
  if (icon) {
    const href=childrenByTag(icon,'href')[0]?.textContent?.trim();
    if (href) p.KMLIconHref=href;
  }
  return p;
}

const buf = await fs.readFile(kmzPath);
const zip = await JSZip.loadAsync(buf);
const kmlName = Object.keys(zip.files).find(n => /\.kml$/i.test(n) && !zip.files[n].dir);
if (!kmlName) throw new Error('Không tìm thấy file KML bên trong master.kmz');
const xml = await zip.files[kmlName].async('string');
const doc = new DOMParser().parseFromString(xml, 'text/xml');

const styles = new Map();
for (const s of childrenByTag(doc,'Style')) {
  const id=s.getAttribute('id'); if (id) styles.set('#'+id, styleProps(s));
}
const styleMaps = new Map();
for (const sm of childrenByTag(doc,'StyleMap')) {
  const id=sm.getAttribute('id'); if (!id) continue;
  let normal='';
  for (const pair of childrenByTag(sm,'Pair')) {
    const su=text(pair,'styleUrl');
    if (text(pair,'key')==='normal' && su) { normal=su; break; }
    if (!normal && su) normal=su;
  }
  if (normal) styleMaps.set('#'+id,normal);
}

const features=[];
for (const pm of childrenByTag(doc,'Placemark')) {
  const p={};
  const name=text(pm,'name'), desc=text(pm,'description'), styleUrl=text(pm,'styleUrl'), vis=text(pm,'visibility');
  if (name) { p.name=name; p.Name=name; p.NAME=name; }
  if (desc) p.description=desc;
  if (styleUrl) p.styleUrl=styleUrl;
  Object.assign(p, styles.get(styleMaps.get(styleUrl) || styleUrl) || {});
  if (vis) p.visibility=/^\d+$/.test(vis) ? Number(vis) : vis;
  let g=null;
  for (const c of Array.from(pm.childNodes || [])) {
    if (c.nodeType !== 1) continue;
    const tag=c.localName || c.nodeName.split(':').pop();
    if (['Point','LineString','Polygon','MultiGeometry'].includes(tag)) { g=geometry(c); break; }
  }
  if (!g) continue;
  features.push({type:'Feature',properties:p,geometry:g});
}

const output={type:'FeatureCollection',features,metadata:{source:'gis_master/master.kmz',builtAt:new Date().toISOString(),featureCount:features.length,conversion:'KML Placemark-preserving converter v12'}};
await fs.mkdir(path.dirname(outPath),{recursive:true});
await fs.writeFile(outPath, JSON.stringify(output));
console.log(`GIS V12 build complete: ${features.length} Placemark features -> ${path.relative(ROOT,outPath)}`);
