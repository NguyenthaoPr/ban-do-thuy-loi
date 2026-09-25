import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';

const ROOT = process.cwd();
const kmzPath = path.join(ROOT, 'gis_master', 'master.kmz');
const outPath = path.join(ROOT, 'gis', 'master.geojson');

function text(node, tag) {
  const el = node.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() || '';
}
function cssKmlColor(v) {
  // KML color is AABBGGRR. Keep alpha separately and return #RRGGBB.
  if (!v) return '';
  const s = String(v).trim().replace('#','');
  if (s.length !== 8) return '';
  return '#' + s.slice(6,8) + s.slice(4,6) + s.slice(2,4);
}
function styleTable(doc) {
  const map = new Map();
  const styles = doc.getElementsByTagName('Style');
  for (let i=0;i<styles.length;i++) {
    const s = styles[i];
    const id = s.getAttribute('id');
    if (!id) continue;
    const line = s.getElementsByTagName('LineStyle')[0];
    const poly = s.getElementsByTagName('PolyStyle')[0];
    const icon = s.getElementsByTagName('IconStyle')[0];
    const rec = {};
    if (line) {
      const c = text(line,'color');
      const w = text(line,'width');
      if (c) rec.KMLColor = c;
      if (w) rec.KMLWidth = Number(w);
    }
    if (poly) {
      const c = text(poly,'color');
      if (c) rec.KMLPolyColor = c;
      const fill = text(poly,'fill');
      if (fill) rec.KMLPolyFill = Number(fill);
      const outline = text(poly,'outline');
      if (outline) rec.KMLOutline = Number(outline);
    }
    if (icon) {
      const href = icon.getElementsByTagName('href')[0]?.textContent?.trim();
      if (href) rec.KMLIconHref = href;
    }
    map.set('#'+id, rec);
  }
  return map;
}

const buf = await fs.readFile(kmzPath);
const zip = await JSZip.loadAsync(buf);
let kmlName = Object.keys(zip.files).find(n => /\.kml$/i.test(n) && !zip.files[n].dir);
if (!kmlName) throw new Error('Không tìm thấy file KML bên trong master.kmz');
const xml = await zip.files[kmlName].async('string');
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const styles = styleTable(doc);
const geo = kml(doc);

for (const f of geo.features || []) {
  f.properties = f.properties || {};
  const p = f.properties;
  const styleUrl = p.styleUrl || p.styleurl || '';
  const style = styles.get(styleUrl);
  if (style) Object.assign(p, style);
  if (p.name == null && f.id) p.name = f.id;
  // Normalize common KML fields used by the map/search layer.
  if (p.Name == null && p.name != null) p.Name = p.name;
  if (p.NAME == null && p.name != null) p.NAME = p.name;
}

const output = JSON.stringify({
  type: 'FeatureCollection',
  features: geo.features || [],
  metadata: {
    source: 'gis_master/master.kmz',
    builtAt: new Date().toISOString(),
    featureCount: (geo.features || []).length
  }
});
await fs.mkdir(path.dirname(outPath), {recursive:true});
await fs.writeFile(outPath, output);
console.log(`GIS build complete: ${geo.features?.length || 0} features -> ${path.relative(ROOT,outPath)}`);
