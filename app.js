/* script.js
   Client-only: dataset + rule-based recommender + Google Maps JS integration.
   Make sure the Google Maps script in index.html has your API key.
*/

(() => {
  // --- Data
  const ACCOMMODATIONS = [
    { id:1, name:"Laoag Bayview Hotel", area:"Laoag", price:1800, rating:4.2, lat:18.198, lng:120.593, desc:"Comfortable mid-range hotel in Laoag City." },
    { id:2, name:"Paoay Heritage Inn", area:"Paoay", price:1500, rating:4.6, lat:18.062, lng:120.522, desc:"Charming inn near Paoay Church." },
    { id:3, name:"Pagudpud Beachfront Cottages", area:"Pagudpud", price:2500, rating:4.5, lat:18.566, lng:120.787, desc:"Beach cottages along the shoreline." },
    { id:4, name:"Burgos Surf Lodge", area:"Burgos", price:1200, rating:4.0, lat:18.505, lng:120.648, desc:"Budget lodge for surfers." },
    { id:5, name:"Currimao Seaview Guesthouse", area:"Currimao", price:900, rating:3.8, lat:18.215, lng:120.600, desc:"Quiet guesthouse with sea views." }
  ];

  // --- DOM
  const searchBox = document.getElementById('searchBox');
  const hotelListEl = document.getElementById('hotelList');
  const areaSelect = document.getElementById('area-select');
  const amenitiesRow = document.getElementById('amenities');
  const budgetEl = document.getElementById('budget');
  const budgetLabel = document.getElementById('budget-label');
  const minRatingEl = document.getElementById('min-rating');
  const ratingLabel = document.getElementById('rating-label');
  const refreshBtn = document.getElementById('refresh-btn');
  const distanceMatrixBtn = document.getElementById('distance-matrix-btn');
  const routePanel = document.getElementById('route-panel');
  const routeInfo = document.getElementById('route-info');
  const clearRouteBtn = document.getElementById('clear-route');

  // --- State
  let map, markers = [], infoWindow, directionsService, directionsRenderer, distanceService;
  let prefs = { budget: Number(budgetEl.value), area: 'any', amenities: [], minRating: Number(minRatingEl.value), center: { lat: 18.1978, lng: 120.593 } };
  let userPosition = null;

  // --- Initialize controls from dataset
  const areas = Array.from(new Set(ACCOMMODATIONS.map(a => a.area))).sort();
  areas.forEach(a => areaSelect.appendChild(Object.assign(document.createElement('option'), { value: a, textContent: a })));
  const allAmenities = Array.from(new Set(ACCOMMODATIONS.flatMap(a => a.amenities || [])));
  // if no amenities in data, provide defaults:
  const defaultAmenities = allAmenities.length ? allAmenities : ['wifi','breakfast','parking','beach','surfboard rental','heritage tours'];
  defaultAmenities.forEach(am => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = am;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      prefs.amenities = prefs.amenities.includes(am) ? prefs.amenities.filter(x => x !== am) : [...prefs.amenities, am];
    });
    amenitiesRow.appendChild(btn);
  });

  budgetLabel.textContent = prefs.budget;
  ratingLabel.textContent = prefs.minRating.toFixed(1);

  // --- Map init (wait until google maps loaded)
  function initMap() {
    map = new google.maps.Map(document.getElementById('map'), { center: prefs.center, zoom: 10 });
    infoWindow = new google.maps.InfoWindow();
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({ map });
    distanceService = new google.maps.DistanceMatrixService();

    // Autocomplete for towns / cities
    const ac = new google.maps.places.Autocomplete(searchBox, { types: ['(cities)'], componentRestrictions: { country: 'ph' } });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry) return;
      map.panTo(place.geometry.location);
      map.setZoom(12);
      prefs.center = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
      // Filter hotels by town name typed
      const town = (searchBox.value || '').trim().toLowerCase();
      const filtered = ACCOMMODATIONS.filter(h => h.area.toLowerCase().includes(town));
      if (filtered.length) {
        renderMarkers(filtered);
        renderList(filtered);
      } else {
        // if none, show hotels near center (by distance)
        const near = ACCOMMODATIONS.slice().sort((a,b)=> distanceTo(a,prefs.center)-distanceTo(b,prefs.center)).slice(0,6);
        renderMarkers(near); renderList(near);
      }
    });

    // Try user geolocation proactively
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        new google.maps.Marker({ position: userPosition, map, title: 'You are here', icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#0f62fe', fillOpacity: 1, strokeWeight: 0 } });
      }, ()=>{/* allowed to fail silently */});
    }

    // initial render
    refreshRecommendations();
  }

  // --- Helpers
  function clearMarkers(){ markers.forEach(m=>m.setMap(null)); markers = []; }
  function renderMarkers(list){
    clearMarkers();
    list.forEach(h => {
      const m = new google.maps.Marker({ position: { lat: h.lat, lng: h.lng }, map, title: h.name });
      m.addListener('click', ()=> showInfo(h,m));
      markers.push(m);
    });
  }
  function showInfo(hotel, marker){
    const html = `<div style="min-width:200px">
                    <strong>${hotel.name}</strong>
                    <div style="font-size:13px;color:#555">⭐ ${hotel.rating} • ₱${hotel.price} • ${hotel.area}</div>
                    <div style="margin-top:6px;font-size:13px;color:#333">${hotel.desc || ''}</div>
                    <div style="margin-top:8px"><button id="__routeBtn" class="btn" style="padding:6px 8px">Route from me</button></div>
                  </div>`;
    infoWindow.setContent(html);
    infoWindow.open(map, marker);
    // attach route button after infoWindow opens:
    google.maps.event.addListenerOnce(infoWindow,'domready', ()=>{
      const btn = document.getElementById('__routeBtn');
      if (btn) btn.addEventListener('click', ()=> routeTo(hotel));
    });
  }

  // Distance (km)
  function distanceTo(a, center){ // a: {lat,lng} or hotel object; center: {lat,lng}
    const lat1 = a.lat || a.position?.lat, lon1 = a.lng || a.position?.lng, lat2 = center.lat, lon2 = center.lng;
    function toRad(x){return x*Math.PI/180}
    const R=6371, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
    const aa = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
  }

  // Rule-based scoring
  function scoreAccommodation(acco, prefsLocal){
    let score = 0;
    if (prefsLocal.budget){
      const diff = acco.price - prefsLocal.budget;
      if (diff <= 0) score += 30 + Math.min(10, Math.abs(diff)/50);
      else if (diff <= prefsLocal.budget*0.25) score += 10;
      else score -= 10;
    }
    if (prefsLocal.area && prefsLocal.area!=='any'){
      if (acco.area.toLowerCase()===prefsLocal.area.toLowerCase()) score += 40;
    } else score += 5;
    if (prefsLocal.amenities && prefsLocal.amenities.length>0){
      const match = prefsLocal.amenities.filter(a => (acco.amenities||[]).includes(a)).length;
      score += match*12;
    }
    if (prefsLocal.minRating){
      if (acco.rating >= prefsLocal.minRating) score += (acco.rating - prefsLocal.minRating)*15 + 10;
      else score -= (prefsLocal.minRating - acco.rating)*10;
    } else score += acco.rating*5;
    if (prefsLocal.center) {
      const dist = distanceTo(acco, prefsLocal.center);
      if (dist <= 5) score += 20;
      else if (dist <= 15) score += 10;
      else if (dist <= 30) score += 5;
      else score -= 5;
    }
    return score;
  }

  // Compute recommendations
  function computeRecommendations(){
    const list = ACCOMMODATIONS.map(a => ({...a, score: scoreAccommodation(a, prefs)}));
    list.sort((a,b)=> b.score - a.score);
    return list;
  }

  function renderList(list){
    hotelListEl.innerHTML = '';
    if (!list.length){ hotelListEl.innerHTML = '<div style="color:var(--muted)">No hotels found.</div>'; return; }
    list.forEach(h=>{
      const item = document.createElement('div'); item.className = 'result-item';
      item.innerHTML = `
        <div class="result-left">
          <div class="hotel-title">${h.name}</div>
          <div class="hotel-meta"> ${h.area} • ₱${h.price} • ⭐ ${h.rating} </div>
          <div style="font-size:13px;color:#333">${h.desc || ''}</div>
        </div>
      `;
      const actions = document.createElement('div'); actions.className = 'action-buttons';
      const centerBtn = document.createElement('button'); centerBtn.className='btn outline'; centerBtn.textContent='Center';
      centerBtn.addEventListener('click', ()=> { map.panTo({lat:h.lat,lng:h.lng}); map.setZoom(14); });
      const routeBtn = document.createElement('button'); routeBtn.className='btn'; routeBtn.textContent='Route';
      routeBtn.addEventListener('click', ()=> routeTo(h));
      actions.appendChild(centerBtn); actions.appendChild(routeBtn);
      item.appendChild(actions);
      hotelListEl.appendChild(item);
    });
  }

  function refreshRecommendations(){
    // recompute center if searchBox has a place
    const recs = computeRecommendations();
    renderMarkers(recs.slice(0, 10));
    renderList(recs.slice(0, 10));
  }

  // Routing from userPosition (requires permission)
  function routeTo(hotel){
    if (!userPosition){
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          doRoute(hotel);
        }, ()=> alert('Please allow location access or center map manually.'));
      } else alert('Geolocation not supported.');
    } else doRoute(hotel);
  }
  function doRoute(hotel){
    const req = { origin: new google.maps.LatLng(userPosition.lat,userPosition.lng), destination: new google.maps.LatLng(hotel.lat,hotel.lng), travelMode: 'DRIVING' };
    directionsService.route(req, (res, status) => {
      if (status==='OK'){ directionsRenderer.setDirections(res); routePanel.hidden=false;
        const leg = res.routes[0].legs[0]; routeInfo.innerHTML = `<strong>${leg.end_address || hotel.name}</strong><div>Distance: ${leg.distance.text} — Duration: ${leg.duration.text}</div>`;}
      else alert('Directions failed: '+status);
    });
  }
  clearRouteBtn?.addEventListener('click', ()=> { directionsRenderer.setDirections({routes:[]}); routePanel.hidden=true; routeInfo.innerHTML=''; });

  // Distance Matrix (simple alert output)
  function computeDistanceMatrix(){
    if (!userPosition){ alert('Please allow location access to compute distances.'); return; }
    const origins = [new google.maps.LatLng(userPosition.lat,userPosition.lng)];
    const destinations = ACCOMMODATIONS.map(a => new google.maps.LatLng(a.lat,a.lng));
    distanceService.getDistanceMatrix({ origins, destinations, travelMode: 'DRIVING', unitSystem: google.maps.UnitSystem.METRIC }, (resp, status)=>{
      if (status !== 'OK') return alert('Distance Matrix failed: '+status);
      const rows = resp.rows[0].elements;
      const lines = rows.map((r,i)=> `${ACCOMMODATIONS[i].name}: ${r.status==='OK' ? r.distance.text + ' / ' + r.duration.text : 'N/A'}`);
      alert('Distances from you:\\n' + lines.join('\\n'));
    });
  }

  // --- Event bindings
  budgetEl.addEventListener('input', e => { prefs.budget = Number(e.target.value); budgetLabel.textContent = prefs.budget; });
  minRatingEl.addEventListener('input', e => { prefs.minRating = Number(e.target.value); ratingLabel.textContent = prefs.minRating.toFixed(1); });
  areaSelect.addEventListener('change', e => { prefs.area = e.target.value; });
  refreshBtn.addEventListener('click', ()=> refreshRecommendations());
  distanceMatrixBtn.addEventListener('click', ()=> computeDistanceMatrix());

  // wait for google
  function waitForGoogle(){ if (window.google && google.maps) initMap(); else setTimeout(waitForGoogle, 200); }
  waitForGoogle();

})();
