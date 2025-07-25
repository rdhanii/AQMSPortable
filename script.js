const map = L.map('map').setView([-6.2, 106.8], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 21,
  attribution: '© OpenStreetMap'
}).addTo(map);

let intervalID = null;
let markers = [];
let sessionData = [];
let polyline = null; // Deklarasi untuk menyimpan instance polyline

// References to session page elements
const fullSessionTbody = document.querySelector("#fullSessionTable tbody");

// Chart instances to manage destruction and recreation
let chartInstances = {}; // Use an object to store chart instances by ID

// Define ISPU thresholds based on the provided image and common ISPU values
// Kategori: Baik, Sedang, Tidak Sehat, Sangat Tidak Sehat, Berbahaya
const ispuThresholds = {
    CO: { // dalam ppb
        baik: 3492, // ISPU 0-50
        sedang: 6983, // ISPU 51-100
        tidakSehat: 13094, // ISPU 101-200
        sangatTidakSehat: 26187, // ISPU 201-300
        berbahaya: 39281 // ISPU >300 (nilai batas tertinggi di tabel)
    },
    NO2: { // dalam ppb (menggunakan data.field3)
        baik: 42.5, // ISPU 0-50
        sedang: 106.3, // ISPU 51-100
        tidakSehat: 600.5, // ISPU 101-200
        sangatTidakSehat: 1201.0, // ISPU 201-300
        berbahaya: 1594.2 // ISPU >300
    },
    PM25: { // dalam µg/m³
        baik: 15.5, // ISPU 0-50
        sedang: 55.4, // ISPU 51-100
        tidakSehat: 150.4, // ISPU 101-200
        sangatTidakSehat: 250.4, // ISPU 201-300
        berbahaya: 500 // ISPU >300
    },
    PM10: { // dalam µg/m³
        baik: 50, // ISPU 0-50
        sedang: 150, // ISPU 51-100
        tidakSehat: 350, // ISPU 101-200
        sangatTidakSehat: 420, // ISPU 201-300
        berbahaya: 500 // ISPU >300
    }
};

// Fungsi untuk menentukan kategori dan warna berdasarkan parameter dan nilai
function getAirQualityCategoryAndColor(parameter, value) {
    const thresholds = ispuThresholds[parameter];
    let category = "Data Tidak Valid";
    let color = "#808080"; // Default grey for unknown or invalid data

    if (value === null || isNaN(value)) {
        category = "Data Tidak Valid";
        color = "#808080"; // Grey
    } else if (value <= thresholds.baik) {
        category = "Baik"; // ISPU 0-50
        color = "blue"; // Biru
    } else if (value <= thresholds.sedang) {
        category = "Sedang"; // ISPU 51-100
        color = "yellow"; // Kuning
    } else if (value <= thresholds.tidakSehat) {
        category = "Tidak Sehat"; // ISPU 101-200
        color = "red"; // Merah
    } else if (value <= thresholds.sangatTidakSehat) {
        category = "Sangat Tidak Sehat"; // ISPU 201-300
        color = "purple"; // Ungu
    } else if (value > thresholds.sangatTidakSehat) { // Untuk nilai di atas kategori Sangat Tidak Sehat (ISPU > 300)
        category = "Berbahaya"; // ISPU >300
        color = "black"; // Hitam
    }
    return { category, color };
}


// Load existing session data from sessionStorage on page load
document.addEventListener('DOMContentLoaded', () => {
    const storedSessionData = sessionStorage.getItem("fullSessionHistory");
    if (storedSessionData) {
        sessionData = JSON.parse(storedSessionData);
    }
    // Initialize home page display
    showPage('home');
    updatePolyline(); // Gambar polyline saat halaman dimuat
});

// Fungsi untuk memperbarui polyline pada peta
function updatePolyline() {
    // Hapus polyline yang ada jika ada
    if (polyline) {
        map.removeLayer(polyline);
    }

    // Ekstrak koordinat dari sessionData
    const latlngs = sessionData.map(row => [row[2], row[3]]); // [latitude, longitude]

    if (latlngs.length > 1) { // Hanya gambar polyline jika ada setidaknya dua titik
        // Gambar polyline baru
        polyline = L.polyline(latlngs, {
            color: 'green', // Warna garis
            weight: 3,      // Ketebalan garis
            opacity: 0.7    // Opasitas garis
        }).addTo(map);
    }
}


async function fetchData() {
  try {
    const res = await await fetch("https://api.thingspeak.com/channels/2991639/feeds/last.json?api_key=SWILLW22I2VRFQWJ");
    const data = await res.json();
    const lat = parseFloat(data.field6);
    const lon = parseFloat(data.field7);
    const co = parseFloat(data.field1); // Ambil nilai CO
    const no = parseFloat(data.field3); // Ambil nilai NO (sekarang diinterpretasikan sebagai NO2)
    const pm25 = parseFloat(data.field4); // Ambil nilai PM2.5
    const pm10 = parseFloat(data.field5); // Ambil nilai PM10

    const date = data.created_at.split("T")[0];
    const time = data.created_at.split("T")[1].substring(0, 8);

    document.getElementById("date").textContent = date;
    document.getElementById("time").textContent = time;
    document.getElementById("lat").textContent = lat;
    document.getElementById("lon").textContent = lon;
    document.getElementById("co").textContent = co;
    document.getElementById("no").textContent = no;
    document.getElementById("pm25").textContent = pm25;
    document.getElementById("pm10").textContent = pm10;
    document.getElementById("sat").textContent = data.field8;

    // Determine air quality category and color for each parameter
    const coQuality = getAirQualityCategoryAndColor('CO', co);
    const no2Quality = getAirQualityCategoryAndColor('NO2', no); // Menggunakan NO2
    const pm25Quality = getAirQualityCategoryAndColor('PM25', pm25);
    const pm10Quality = getAirQualityCategoryAndColor('PM10', pm10);

    // Untuk warna marker, kita bisa pakai kategori terburuk dari semua parameter.
    // Atau bisa juga mengikuti patokan utama seperti PM2.5.
    // Di sini, saya akan menentukan warna marker berdasarkan kategori terburuk
    // dari PM2.5, PM10, CO, dan NO2.
    let worstCategoryColor = "blue"; // Default Baik (Biru)
    let worstCategoryText = "Baik";

    // Prioritas warna: Hitam > Ungu > Merah > Kuning > Biru
    const categoryOrder = ["Data Tidak Valid", "Berbahaya", "Sangat Tidak Sehat", "Tidak Sehat", "Sedang", "Baik"];
    
    // Fungsi pembantu untuk membandingkan dan mendapatkan kategori/warna terburuk
    function updateWorst(currentWorstCategory, newCategory, newColor) {
        const currentWorstIndex = categoryOrder.indexOf(currentWorstCategory);
        const newCategoryIndex = categoryOrder.indexOf(newCategory);

        if (newCategoryIndex < currentWorstIndex) {
            return { category: newCategory, color: newColor };
        }
        return { category: currentWorstCategory, color: currentWorstColor };
    }

    let currentWorstColor = "blue";
    let currentWorstCategory = "Baik";

    // Membandingkan kategori dari semua parameter
    const categories = [coQuality, no2Quality, pm25Quality, pm10Quality];
    categories.forEach(q => {
        const updated = updateWorst(currentWorstCategory, q.category, q.color);
        currentWorstCategory = updated.category;
        currentWorstColor = updated.color;
    });

    const markerColor = currentWorstColor; // Warna marker berdasarkan kategori terburuk

    const popupContent = `
      <b>Waktu:</b> ${date} ${time}<br>
      <b>CO:</b> ${co} (${coQuality.category})<br>
      <b>NO2:</b> ${no} (${no2Quality.category})<br>
      <b>PM2.5:</b> ${pm25} (${pm25Quality.category})<br>
      <b>PM10:</b> ${pm10} (${pm10Quality.category})<br>
      <br>
      <b>Kualitas Udara Umum:</b> <span style="color:${markerColor}; font-weight:bold;">${currentWorstCategory}</span>
    `;

    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: markerColor, // Warna border marker
      fillColor: markerColor, // Warna isi marker
      fillOpacity: 0.8
    }).addTo(map).bindPopup(popupContent).openPopup();

    markers.push(marker);
    map.setView([lat, lon]);

    const rowData = [date, time, lat, lon, co, no, pm25, pm10, data.field8];
    
    // Check for duplicates before adding to sessionData
    if (!sessionData.find(r => r[0] === date && r[1] === time)) {
      sessionData.unshift(rowData); // Add new data to the beginning
      // Save the entire sessionData array to sessionStorage
      sessionStorage.setItem("fullSessionHistory", JSON.stringify(sessionData));
      
      // Update polyline after new data is added
      updatePolyline();

      // NEW: Jika halaman sesi sedang aktif, perbarui tabel dan grafik sesi secara otomatis
      if (document.getElementById('session').classList.contains('active')) {
          updateSessionTablesAndCharts();
      }
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
      const date = dataRow[0];
      const time = dataRow[1];
      const lat = dataRow[2];
      const lon = dataRow[3];
      const co = dataRow[4];
      const no = dataRow[5]; // Ini sekarang adalah NO2
      const pm25 = dataRow[6];
      const pm10 = dataRow[7];
      const satelit = dataRow[8];

      // Populate full session table
      const mainRow = fullSessionTbody.insertRow();
      const mainValues = [index + 1, date, time, lat, lon, co, no, pm25, pm10, satelit];
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
    chartInstances.noChart = createLineChart('noChart', 'NO2', noValues, 'rgb(153, 102, 255)', 'rgba(153, 102, 255, 0.2)', labels);
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
      // Menambahkan setTimeout untuk memberikan waktu bagi DOM untuk merender
      setTimeout(() => {
          map.invalidateSize();
      }, 100); // Penundaan 100 milidetik
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
  
  // Hapus polyline saat reset
  if (polyline) {
      map.removeLayer(polyline);
      polyline = null;
  }

  map.setView([-6.2, 106.8], 11); // Reset map view
  // Also clear data panel on home page if visible
  document.getElementById("date").textContent = "-";
  document.getElementById("time").textContent = "-";
  document.getElementById("lat").textContent = "-";
  document.getElementById("lon").textContent = "-";
  document.getElementById("co").textContent = "-";
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
  // NH3 removed from CSV header
  const header = ["No","Tanggal","Waktu","Lat","Lon","CO","NO","PM2.5","PM10","Satelit"];
  const csvRows = [header.join(",")];
  sessionData.forEach((row, i) => {
    // NH3 removed from row. The indices in rowData are shifted.
    // rowData structure: [date, time, lat, lon, data.field1, data.field3, data.field4, data.field5, data.field8]
    // So for CSV: [i+1, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]]
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