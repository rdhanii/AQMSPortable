const map = L.map('map').setView([-6.2, 106.8], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 21,
  attribution: '© OpenStreetMap'
}).addTo(map);

let intervalID = null;
let markers = [];
let sessionData = [];

// References to session page elements
const fullSessionTbody = document.querySelector("#fullSessionTable tbody");

// Chart instances to manage destruction and recreation
let chartInstances = {}; // Use an object to store chart instances by ID

// Load existing session data from sessionStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    const storedSessionData = sessionStorage.getItem("fullSessionHistory");
    if (storedSessionData) {
        sessionData = JSON.parse(storedSessionData);
    }
    // Initialize home page display
    showPage('home');
});


async function fetchData() {
  try {
    const res = await fetch("https://api.thingspeak.com/channels/2991639/feeds/last.json?api_key=SWILLW22I2VRFQWJ");
    const data = await res.json();
    const lat = parseFloat(data.field6);
    const lon = parseFloat(data.field7);

    const date = data.created_at.split("T")[0];
    const time = data.created_at.split("T")[1].substring(0, 8);

    document.getElementById("date").textContent = date;
    document.getElementById("time").textContent = time;
    document.getElementById("lat").textContent = lat;
    document.getElementById("lon").textContent = lon;
    document.getElementById("co").textContent = data.field1;
    document.getElementById("nh3").textContent = data.field2;
    document.getElementById("no").textContent = data.field3;
    document.getElementById("pm25").textContent = data.field4;
    document.getElementById("pm10").textContent = data.field5;
    document.getElementById("sat").textContent = data.field8;

    const popupContent = `
      <b>Waktu:</b> ${date} ${time}<br>
      <b>Latitude:</b> ${lat}<br>
      <b>Longitude:</b> ${lon}<br>
      <b>CO:</b> ${data.field1}<br>
      <b>NH3:</b> ${data.field2}<br>
      <b>NO:</b> ${data.field3}<br>
      <b>PM2.5:</b> ${data.field4}<br>
      <b>PM10:</b> ${data.field5}<br>
      <b>Satelit:</b> ${data.field8}
    `;

    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: 'blue',
      fillColor: 'blue',
      fillOpacity: 0.8
    }).addTo(map).bindPopup(popupContent).openPopup();

    markers.push(marker);
    map.setView([lat, lon]);

    const rowData = [date, time, lat, lon, data.field1, data.field2, data.field3, data.field4, data.field5, data.field8];
    
    // Check for duplicates before adding to sessionData
    // A simple check by date and time is used here, refine if needed.
    if (!sessionData.find(r => r[0] === date && r[1] === time)) {
      sessionData.unshift(rowData); // Add new data to the beginning
      // Save the entire sessionData array to sessionStorage
      sessionStorage.setItem("fullSessionHistory", JSON.stringify(sessionData));
    }
  } catch (err) {
    console.error("Data fetch error:", err);
  }
}

function updateSessionTablesAndCharts() {
  // Clear existing full session table content
  fullSessionTbody.innerHTML = "";

  const labels = [];
  const pm25Values = [];
  const pm10Values = [];
  const coValues = [];
  const noValues = [];

  // Iterate over the current sessionData (newest first)
  // To display chronologically in charts, we need to iterate from oldest to newest
  // The sessionData is stored newest first (unshift), so reverse for display.
  const sortedSessionData = [...sessionData].reverse(); // Create a copy and reverse

  sortedSessionData.forEach((dataRow, index) => {
      const date = dataRow.length > 0 ? dataRow[0] : '-';
      const time = dataRow.length > 1 ? dataRow[1] : '-';
      const lat = dataRow.length > 2 ? dataRow[2] : '-';
      const lon = dataRow.length > 3 ? dataRow[3] : '-';
      const co = dataRow.length > 4 ? dataRow[4] : '-';
      const nh3 = dataRow.length > 5 ? dataRow[5] : '-';
      const no = dataRow.length > 6 ? dataRow[6] : '-';
      const pm25 = dataRow.length > 7 ? dataRow[7] : '-';
      const pm10 = dataRow.length > 8 ? dataRow[8] : '-';
      const satelit = dataRow.length > 9 ? dataRow[9] : '-';

      // Populate full session table
      const mainRow = fullSessionTbody.insertRow();
      // Use original index + 1 for numbering if you want chronological, or sessionData.length - index if you want newest first
      const mainValues = [index + 1, date, time, lat, lon, co, nh3, no, pm25, pm10, satelit];
      mainValues.forEach(val => {
          const cell = mainRow.insertCell();
          cell.textContent = val !== undefined ? val : "-";
      });

      // Collect data for charts (these already come in chronological order from sortedSessionData)
      labels.push(`${date} ${time}`);
      pm25Values.push(parseFloat(pm25) || 0);
      pm10Values.push(parseFloat(pm10) || 0);
      coValues.push(parseFloat(co) || 0);
      noValues.push(parseFloat(no) || 0);
  });

  // Destroy previous chart instances before creating new ones
  for (const chartId in chartInstances) {
      if (chartInstances[chartId]) {
          chartInstances[chartId].destroy();
          chartInstances[chartId] = null; // Clear reference
      }
  }

  // Create charts if data exists
  if (labels.length > 0) {
    chartInstances.pm25Chart = createLineChart('pm25Chart', 'PM2.5', pm25Values, 'rgb(255, 99, 132)', 'rgba(255, 99, 132, 0.2)', labels);
    chartInstances.pm10Chart = createLineChart('pm10Chart', 'PM10', pm10Values, 'rgb(54, 162, 235)', 'rgba(54, 162, 235, 0.2)', labels);
    chartInstances.coChart = createLineChart('coChart', 'CO', coValues, 'rgb(75, 192, 192)', 'rgba(75, 192, 192, 0.2)', labels);
    chartInstances.noChart = createLineChart('noChart', 'NO', noValues, 'rgb(153, 102, 255)', 'rgba(153, 102, 255, 0.2)', labels);
  } else {
      console.log("No historical data found in sessionStorage for charts.");
      // Optionally clear the chart canvases if no data
      const chartIds = ['pm25Chart', 'pm10Chart', 'coChart', 'noChart'];
      chartIds.forEach(id => {
          const canvas = document.getElementById(id);
          if (canvas) {
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
      });
  }
}

// Function to create a line chart
function createLineChart(canvasId, label, data, borderColor, backgroundColor, labels) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) {
    console.error(`Canvas element with ID '${canvasId}' not found.`);
    return null;
  }
  return new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels, // Use the common labels (time)
      datasets: [{
        label: label,
        data: data,
        borderColor: borderColor,
        backgroundColor: backgroundColor,
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // Allows flexible sizing by parent
      plugins: {
        title: {
          display: true,
          text: label + ' (Tren Waktu)'
        },
        tooltip: {
            mode: 'index',
            intersect: false
        }
      },
      scales: {
        x: {
          type: 'category',
          title: {
            display: true,
            text: 'Waktu'
          },
          ticks: {
            autoSkip: true,
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          title: {
            display: true,
            text: 'Nilai'
          },
          beginAtZero: true
        }
      }
    }
  });
}


function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const pageToShow = document.getElementById(id);
  if (pageToShow) {
      pageToShow.classList.add("active");
  } else {
      console.error(`Page with ID '${id}' not found.`);
  }

  document.getElementById("homeBtn").classList.toggle("active", id === "home");
  document.getElementById("sessionBtn").classList.toggle("active", id === "session");

  // When switching to the session page, update its content and charts
  if (id === "session") {
      updateSessionTablesAndCharts();
  }
  // When switching back to home, make sure map is invalidated
  if (id === "home") {
      map.invalidateSize(); // Ensures Leaflet map renders correctly after display:none
  }
}

document.getElementById("startBtn").onclick = () => {
  if (!intervalID) {
    fetchData(); // Fetch immediately on start
    intervalID = setInterval(fetchData, 30000); // Then fetch every 30 seconds
  }
};
document.getElementById("stopBtn").onclick = () => {
  clearInterval(intervalID);
  intervalID = null;
};
document.getElementById("resetBtn").onclick = () => {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  sessionData = []; // Clear local data
  sessionStorage.removeItem("fullSessionHistory"); // Clear stored data
  updateSessionTablesAndCharts(); // Clear tables and charts
  map.setView([-6.2, 106.8], 11); // Reset map view
  // Also clear data panel on home page if visible
  document.getElementById("date").textContent = "-";
  document.getElementById("time").textContent = "-";
  document.getElementById("lat").textContent = "-";
  document.getElementById("lon").textContent = "-";
  document.getElementById("co").textContent = "-";
  document.getElementById("nh3").textContent = "-";
  document.getElementById("no").textContent = "-";
  document.getElementById("pm25").textContent = "-";
  document.getElementById("pm10").textContent = "-";
  document.getElementById("sat").textContent = "-";
};

document.getElementById("downloadMapBtn").onclick = () => {
  leafletImage(map, function(err, canvas) {
    if (err) {
      console.error("Leaflet image error:", err);
      return;
    }
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    const ctx = finalCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, 0);

    markers.forEach(marker => {
      if (marker instanceof L.CircleMarker) {
        const pos = map.latLngToContainerPoint(marker.getLatLng());
        const radius = marker.getRadius();
        const color = marker.options.color;
        const fillColor = marker.options.fillColor;
        const fillOpacity = marker.options.fillOpacity;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    const overlayImg = document.getElementById("mapOverlayImage");
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = overlayImg.src;

    img.onload = function() {
      ctx.drawImage(img, 0, 0, finalCanvas.width, finalCanvas.height);
      finalCanvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "map_with_markers_overlay.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = function(e) {
      console.error("Overlay image load error:", e);
      alert("Gagal memuat laporan.png overlay. Pastikan dapat diakses dan disajikan dengan header CORS yang benar jika dari asal yang berbeda.");
    };
  });
};

document.getElementById("downloadAllDataCsvBtn").onclick = () => {
  const header = ["No","Tanggal","Waktu","Lat","Lon","CO","NH3","NO","PM2.5","PM10","Satelit"];
  const csvRows = [header.join(",")];
  sessionData.forEach((row, i) => {
    csvRows.push([i+1, ...row].map(val => `"${val}"`).join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "session_data.csv";
  link.click();
}
// Tambahkan event listener untuk memvalidasi ukuran peta saat jendela diubah ukurannya
window.addEventListener('resize', () => {
    // Hanya panggil invalidateSize jika halaman 'home' sedang aktif
    if (document.getElementById('home').classList.contains('active')) {
        map.invalidateSize();
    }
});