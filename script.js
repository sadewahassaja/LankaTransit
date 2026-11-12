// LankaTransit map interactions — Leaflet + OpenStreetMap + public OSM/OSRM services.
const map = L.map('map', {scrollWheelZoom: true}).setView([7.8731, 80.7718], 7);
L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Tiles © Esri — Sources: Esri, Garmin, USGS, NOAA, and OpenStreetMap contributors'
  }
).addTo(map);

const layers = {
  rail: L.geoJSON(null, {style: {color:'#9855c5', weight:3}, pointToLayer: (_, ll) => L.circleMarker(ll,{radius:4,color:'#9855c5',fillColor:'#fff',fillOpacity:1,weight:2}), onEachFeature: (f,l) => popup(f,l,'Railway feature')}),
  roads: L.geoJSON(null, {style: {color:'#ed8a35', weight:3}, onEachFeature: (f,l) => popup(f,l,'Main road')}),
  airports: L.geoJSON(null, {pointToLayer: (_,ll)=>L.circleMarker(ll,{radius:7,color:'#078f8b',fillColor:'#5bd1c4',fillOpacity:1,weight:2}), onEachFeature:(f,l)=>popup(f,l,'Airport')}),
  ports: L.geoJSON(null, {pointToLayer: (_,ll)=>L.circleMarker(ll,{radius:7,color:'#2369c5',fillColor:'#83b8ff',fillOpacity:1,weight:2}), onEachFeature:(f,l)=>popup(f,l,'Port')})
};
function popup(feature, layer, fallback) {
  const p = feature.properties || {};
  const name = p.name || p.ref || p.operator || fallback;
  const details = Object.entries(p).filter(([k,v]) => v && ['railway','highway','aeroway','harbour','industrial','ref'].includes(k)).map(([k,v])=>`${k}: ${v}`).join('<br>');
  layer.bindPopup(`<strong>${escapeHtml(name)}</strong>${details ? `<br><small>${escapeHtml(details)}</small>`:''}<br><small>OpenStreetMap data</small>`);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
Object.values(layers).forEach(l=>l.addTo(map));

const bounds = '6.0,79.0,10.0,82.2'; // south, west, north, east — Sri Lanka bounding box
async function loadOverpass(key, query) {
  const endpoint = 'https://overpass-api.de/api/interpreter';
  try {
    const response = await fetch(endpoint, {method:'POST', body:'data='+encodeURIComponent(query)});
    if(!response.ok) throw new Error('OpenStreetMap query is temporarily unavailable.');
    const data = await response.json();
    const geo = overpassToGeoJSON(data.elements || []);
    layers[key].clearLayers().addData(geo);
  } catch(err) {
    console.warn(`${key} layer:`, err.message);
    showStatus(`${key} map overlay could not be loaded right now. The base map still works.`);
  }
}
function overpassToGeoJSON(elements) {
  const features=[];
  const nodes=new Map(elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
  for(const e of elements){
    const props=e.tags||{};
    if(e.type==='node' && e.lat && e.lon){
      features.push({type:'Feature',properties:props,geometry:{type:'Point',coordinates:[e.lon,e.lat]}});
    } else if(e.type==='way' && e.geometry && e.geometry.length){
      const coords=e.geometry.map(p=>[p.lon,p.lat]);
      if(coords.length>1) features.push({type:'Feature',properties:props,geometry:{type:'LineString',coordinates:coords}});
    } else if(e.type==='way' && e.nodes){
      const coords=e.nodes.map(id=>nodes.get(id)).filter(Boolean).map(n=>[n.lon,n.lat]);
      if(coords.length>1) features.push({type:'Feature',properties:props,geometry:{type:'LineString',coordinates:coords}});
    }
  }
  return {type:'FeatureCollection',features};
}
const q = {
 rail:`[out:json][timeout:35];(way["railway"~"rail|narrow_gauge"]( ${bounds});node["railway"="station"](${bounds}););out body geom;`,
 roads:`[out:json][timeout:35];way["highway"~"motorway|trunk|primary"]( ${bounds});out body geom;`,
 airports:`[out:json][timeout:25];(node["aeroway"="aerodrome"](${bounds});way["aeroway"="aerodrome"](${bounds}););out center;`,
 ports:`[out:json][timeout:25];(node["harbour"](${bounds});way["harbour"](${bounds});node["industrial"="port"](${bounds}););out center;`
};
loadOverpass('rail',q.rail); loadOverpass('roads',q.roads); loadOverpass('airports',q.airports); loadOverpass('ports',q.ports);

function setView(view){
  document.querySelectorAll('.map-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='world') map.setView([20,20],2);
  if(view==='srilanka') map.setView([7.8731,80.7718],7);
  if(view==='highways'){map.setView([7.8731,80.7718],8);document.getElementById('roadLayer').checked=true;layers.roads.addTo(map);}
  setTimeout(()=>map.invalidateSize(),100);
}
document.querySelectorAll('.map-tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
[['railLayer','rail'],['roadLayer','roads'],['airportLayer','airports'],['portLayer','ports']].forEach(([id,key])=>{
  document.getElementById(id).addEventListener('change',e=>e.target.checked?layers[key].addTo(map):map.removeLayer(layers[key]));
});
document.querySelectorAll('[data-focus]').forEach(a=>a.addEventListener('click',()=>{
  const type=a.dataset.focus; setView(type==='highways'?'highways':'srilanka');
  const mapping={rail:'railLayer',roads:'roadLayer',airports:'airportLayer',ports:'portLayer',highways:'roadLayer'};
  if(mapping[type]){const el=document.getElementById(mapping[type]);el.checked=true;layers[type==='highways'?'roads':type].addTo(map);}
}));

async function geocode(text){
  const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=lk&q=${encodeURIComponent(text)}`;
  const r=await fetch(url,{headers:{'Accept-Language':'en'}});
  if(!r.ok) throw new Error('Location search is unavailable. Try again later.');
  const data=await r.json();
  if(!data.length) throw new Error(`Could not find "${text}" in Sri Lanka.`);
  return {lat:+data[0].lat,lon:+data[0].lon,name:data[0].display_name};
}
function showStatus(message){document.getElementById('routeResult').textContent=message;}
document.getElementById('searchBtn').addEventListener('click',async()=>{
  const value=document.getElementById('placeSearch').value.trim(); if(!value)return;
  const btn=document.getElementById('searchBtn');btn.disabled=true;btn.textContent='Searching…';
  try{const p=await geocode(value);map.setView([p.lat,p.lon],14);L.marker([p.lat,p.lon]).addTo(map).bindPopup(escapeHtml(p.name)).openPopup();document.getElementById('explore').scrollIntoView({behavior:'smooth'});}
  catch(e){alert(e.message);}finally{btn.disabled=false;btn.textContent='Search location';}
});
document.getElementById('placeSearch').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('searchBtn').click();});

let routeLayer=null;
document.getElementById('routeBtn').addEventListener('click',async()=>{
  const from=document.getElementById('fromPlace').value.trim(),to=document.getElementById('toPlace').value.trim();
  if(!from||!to){showStatus('Please enter both starting point and destination.');return;}
  const btn=document.getElementById('routeBtn');btn.disabled=true;btn.textContent='Finding…';showStatus('Searching locations and calculating a suggested driving route…');
  try{
    const [a,b]=await Promise.all([geocode(from),geocode(to)]);
    const url=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
    const response=await fetch(url);if(!response.ok)throw new Error('Routing service is unavailable.');
    const result=await response.json();if(result.code!=='Ok'||!result.routes.length)throw new Error('No driving route was found for these locations.');
    if(routeLayer)map.removeLayer(routeLayer);
    routeLayer=L.geoJSON(result.routes[0].geometry,{style:{color:'#126fd0',weight:5,opacity:.9}}).addTo(map);
    L.marker([a.lat,a.lon]).addTo(map).bindPopup('Start: '+escapeHtml(from));
    L.marker([b.lat,b.lon]).addTo(map).bindPopup('Destination: '+escapeHtml(to));
    map.fitBounds(routeLayer.getBounds(),{padding:[35,35]});
    const r=result.routes[0];showStatus(`Suggested driving route: ${(r.distance/1000).toFixed(1)} km • Approx. ${(r.duration/3600).toFixed(1)} hours. This is an estimate from OSRM, not official traffic or live travel time.`);
  }catch(e){showStatus(e.message);}finally{btn.disabled=false;btn.textContent='Find route →';}
});
document.getElementById('menuToggle').addEventListener('click',()=>document.getElementById('mainNav').classList.toggle('open'));
document.querySelectorAll('.main-nav a').forEach(a=>a.addEventListener('click',()=>document.getElementById('mainNav').classList.remove('open')));
