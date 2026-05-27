import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

// Fix Leaflet default icon path issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;

function createWellIcon(color, isActive) {
  const size = isActive ? 18 : 12;
  const pulse = isActive
    ? `<circle cx="20" cy="20" r="18" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"><animate attributeName="r" from="12" to="24" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/></circle>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    ${pulse}
    <circle cx="20" cy="20" r="${size / 2 + 4}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/>
    <circle cx="20" cy="20" r="${size / 2}" fill="${color}"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

export default function WellMap({
  files,
  wellCoords,
  selectedWellIds = [],
  activeFileId,
  onSelectWell,
  pinningWellId,
  onPinCoord,
  darkMode,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const tileLayerRef = useRef(null);

  // Initialize map
  useEffect(() => {
    if (mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-15.78, -47.93], // Brazil default
      zoom: 4,
      zoomControl: true,
    });

    const tileUrl = darkMode
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.markerClusterGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update tile layer URL dynamically when theme changes
  useEffect(() => {
    if (tileLayerRef.current) {
      const tileUrl = darkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      tileLayerRef.current.setUrl(tileUrl);
    }
  }, [darkMode]);


  // Handle pin-on-map clicks
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (pinningWellId) {
      map.getContainer().style.cursor = "crosshair";
      const handler = (e) => {
        onPinCoord(pinningWellId, e.latlng.lat, e.latlng.lng);
      };
      map.on("click", handler);
      return () => {
        map.off("click", handler);
        map.getContainer().style.cursor = "";
      };
    } else {
      map.getContainer().style.cursor = "";
    }
  }, [pinningWellId, onPinCoord]);

  const fittedFileIdsRef = useRef("");

  // Fit bounds only when the set of files changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const fileIds = files.map((f) => f.id).join(",");
    if (fileIds === fittedFileIdsRef.current) return;
    fittedFileIdsRef.current = fileIds;

    const bounds = [];
    files.forEach((file) => {
      const coords = wellCoords[file.id];
      if (
        coords &&
        coords.lat != null &&
        coords.lng != null &&
        !isNaN(coords.lat) &&
        !isNaN(coords.lng)
      ) {
        bounds.push([coords.lat, coords.lng]);
      }
    });

    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 12);
      } else {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }
  }, [files, wellCoords]);

  // Smoothly fly to the active well when it changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeFileId) return;
    const coords = wellCoords[activeFileId];
    if (
      coords &&
      coords.lat != null &&
      coords.lng != null &&
      !isNaN(coords.lat) &&
      !isNaN(coords.lng)
    ) {
      map.flyTo([coords.lat, coords.lng], 13, {
        animate: true,
        duration: 1.2,
      });
    }
  }, [activeFileId, wellCoords]);

  // Update markers whenever files, coords or active file changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    files.forEach((file) => {
      const coords = wellCoords[file.id];
      if (!coords || coords.lat == null || coords.lng == null) return;
      if (isNaN(coords.lat) || isNaN(coords.lng)) return;

      const isSelected = (selectedWellIds || []).includes(file.id);
      const isActive = file.id === activeFileId;
      const color = isSelected ? "#22c55e" : "#3b82f6"; // Green for selected, Blue for unselected
      const icon = createWellIcon(color, isActive);

      const wellName =
        file.parsed.metadata?.well?.WELL?.value ||
        file.name.replace(/\.las$/i, "");
      const samples = file.parsed.data.length;
      const curves = Math.max(0, file.parsed.curves.length - 1);

      const popup = L.popup({ className: "well-popup" }).setContent(`
        <div style="font-family:system-ui,sans-serif;min-width:180px;">
          <div style="font-weight:700;font-size:14px;color:#0e7490;margin-bottom:6px;">${wellName}</div>
          <div style="font-size:12px;color:#475569;line-height:1.7;">
            <div>📁 ${file.name}</div>
            <div>📊 ${samples.toLocaleString("pt-BR")} amostras · ${curves} curvas</div>
            <div>📍 ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</div>
          </div>
        </div>
      `);

      const marker = L.marker([coords.lat, coords.lng], {
        icon,
        zIndexOffset: isActive ? 1000 : 0,
      })
        .bindPopup(popup)
        .bindTooltip(wellName, {
          permanent: true,
          direction: "top",
          offset: [0, -8],
          className: "well-label",
        })
        .on("click", () => onSelectWell(file.id));

      markersLayer.addLayer(marker);
    });
  }, [files, wellCoords, activeFileId, selectedWellIds, onSelectWell]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      />
      {pinningWellId && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(2,6,23,0.9)",
            border: "1px solid #22d3ee",
            borderRadius: 12,
            padding: "8px 16px",
            color: "#22d3ee",
            fontSize: 13,
            fontWeight: 600,
            pointerEvents: "none",
            backdropFilter: "blur(8px)",
          }}
        >
          🗺️ Clique no mapa para definir a localização do poço
        </div>
      )}
    </div>
  );
}
