// Turns the Kerala district GeoJSON (Census 2011 boundaries, via udit-001/india-maps-data)
// into compact SVG paths for the interactive map. Thiruvananthapuram is split into the
// union's North and South committees along an approximate latitude line.
// Run: npm run map
import { readFileSync, writeFileSync } from 'node:fs';
import { geoMercator, geoPath, geoCentroid } from 'd3-geo';
import polygonClipping from 'polygon-clipping';

const SRC = new URL('../src/data/geo/kerala-districts.geojson', import.meta.url);
const OUT = new URL('../src/data/geo/kerala-map.json', import.meta.url);
const TVM_SPLIT_LAT = 8.585;

const slugByName = {
  Kasaragod: 'kasaragod', Kannur: 'kannur', Wayanad: 'wayanad', Kozhikode: 'kozhikode',
  Malappuram: 'malappuram', Palakkad: 'palakkad', Thrissur: 'thrissur', Ernakulam: 'ernakulam',
  Idukki: 'idukki', Kottayam: 'kottayam', Alappuzha: 'alappuzha', Pathanamthitta: 'pathanamthitta',
  Kollam: 'kollam',
};

const geo = JSON.parse(readFileSync(SRC, 'utf8'));
const features = [];
for (const f of geo.features) {
  const name = f.properties.district;
  if (name === 'Thiruvananthapuram') {
    const coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const north = [[[70, TVM_SPLIT_LAT], [80, TVM_SPLIT_LAT], [80, 10], [70, 10], [70, TVM_SPLIT_LAT]]];
    const south = [[[70, 7], [80, 7], [80, TVM_SPLIT_LAT], [70, TVM_SPLIT_LAT], [70, 7]]];
    // polygon-clipping returns counter-clockwise outer rings (the GeoJSON spec), but d3-geo reads
    // those as "the whole globe minus this shape". Reverse them to d3's clockwise order.
    const clip = (box) => polygonClipping.intersection(coords, box).map((poly) => poly.map((ring) => [...ring].reverse()));
    features.push({ type: 'Feature', properties: { slug: 'tvm-north' }, geometry: { type: 'MultiPolygon', coordinates: clip(north) } });
    features.push({ type: 'Feature', properties: { slug: 'tvm-south' }, geometry: { type: 'MultiPolygon', coordinates: clip(south) } });
  } else {
    features.push({ ...f, properties: { slug: slugByName[name] } });
  }
}

const W = 360, H = 640, PAD = 12;
const fc = { type: 'FeatureCollection', features };
const projection = geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], fc);
const path = geoPath(projection);
const round = (d) => d.replace(/(\d+\.\d)\d+/g, '$1');

const districts = features.map((f) => {
  const [cx, cy] = projection(geoCentroid(f));
  return { slug: f.properties.slug, d: round(path(f)), cx: +cx.toFixed(1), cy: +cy.toFixed(1) };
});
writeFileSync(OUT, JSON.stringify({ viewBox: `0 0 ${W} ${H}`, districts }));
console.log(`wrote ${districts.length} districts, ${(JSON.stringify(districts).length / 1024).toFixed(1)} KB`);
