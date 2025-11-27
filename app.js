// --- Municipalities of Ilocos Norte ---
const municipalities = [
    "Adams","Bacarra","Badoc","Bangui","Banna (Espiritu)","Burgos",
    "Carasi","Currimao","Dingras","Dumalneg","Laoag City","Batac City",
    "Marcos","Nueva Era","Pagudpud","Paoay","Pasuquin","Piddig",
    "Pinili","San Nicolas","Sarrat","Solsona","Vintar"
];

// --- Sample Accommodation Knowledge Base (with coordinates) ---
const accommodations = [
    {
        name: "Casa Felisa",
        municipality: "Laoag City",
        price: "low",
        amenities: ["wifi","parking"],
        lat: 18.1978, lng: 120.5952
    },
    {
        name: "Pagudpud Blue Lagoon Resort",
        municipality: "Pagudpud",
        price: "mid",
        amenities: ["beachfront","wifi","restaurant"],
        lat: 18.5667, lng: 120.7870
    },
    {
        name: "Paoay Heritage Hotel",
        municipality: "Paoay",
        price: "mid",
        amenities: ["wifi","parking","breakfast"],
        lat: 18.0635, lng: 120.5222
    }
];

let map;
let markers = [];

// --- Initialize Google Map ---
function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: {lat: 18.1978, lng: 120.5952},
        zoom: 10
    });
}

// --- Plot markers on map ---
function plotMarkers(recommendations) {
    markers.forEach(m => m.setMap(null));
    markers = [];

    recommendations.forEach(r => {
        const marker = new google.maps.Marker({
            position: {lat: r.lat, lng: r.lng},
            map,
            title: r.name
        });
        markers.push(marker);
    });

    if (recommendations.length > 0) {
        map.setCenter({lat: recommendations[0].lat, lng: recommendations[0].lng});
        map.setZoom(12);
    }
}

// --- Populate municipality dropdown ---
const locationDropdown = document.getElementById("location");
municipalities.forEach(m => {
    let opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    locationDropdown.appendChild(opt);
});

// --- Rule-based scoring ---
function score(pref, ac) {
    let pts = 0;

    if (pref.location && ac.municipality === pref.location)
        pts += 30;

    if (ac.price === pref.budget)
        pts += 25;

    const matchAmenities = pref.amenities.filter(a => ac.amenities.includes(a)).length;
    pts += matchAmenities * 10;

    if (pref.tripType === "adventure" && ac.municipality === "Pagudpud")
        pts += 20;

    if (pref.tripType === "culture" && ac.municipality === "Paoay")
        pts += 20;

    return pts;
}

// --- Handle Form Submission ---
document.getElementById("prefForm").addEventListener("submit", function(e){
    e.preventDefault();

    const pref = {
        budget: document.getElementById("budget").value,
        location: document.getElementById("location").value,
        tripType: document.getElementById("tripType").value,
        amenities: Array.from(document.querySelectorAll("input[type=checkbox]:checked")).map(a => a.value)
    };

    const scored = accommodations
        .map(a => ({...a, score: score(pref, a)}))
        .sort((a,b) => b.score - a.score);

    // Display results
    const results = document.getElementById("results");
    results.innerHTML = "";
    scored.forEach(r => {
        let div = document.createElement("div");
        div.className = "reco";
        div.innerHTML = `<strong>${r.name}</strong><br>
                         Municipality: ${r.municipality}<br>
                         Score: ${r.score}`;
        results.appendChild(div);
    });

    // Plot markers
    plotMarkers(scored);
});
