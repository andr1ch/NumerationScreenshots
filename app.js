const DEFAULTS = {
  startNumber: 1,
  baseFontSize: 100,
  leftMargin: 58,
  bottomMargin: 42,
  referenceWidth: 1280,
  referenceHeight: 720,
  strokeWidth: 1,
  shadowX: 0,
  shadowY: 4,
  shadowSpread: 12,
  shadowLayers: 8,
  shadowOpacity: 25,
  shadowBoost: 10,
  maxWidthRatio: 0.18,
  maxHeightRatio: 0.24,
  gradientTop: "#E3A6FF",
  gradientBottom: "#67E8FF",
  strokeColor: "#000000",
  shadowColor: "#000000",
  fontFamily: '"Dela Gothic One Local", "Arial Black", sans-serif',
};

const state = {
  files: [],
  results: [],
  zipBlobUrl: null,
};

const ui = {
  fileInput: document.querySelector("#file-input"),
  processButton: document.querySelector("#process-button"),
  downloadButton: document.querySelector("#download-button"),
  clearButton: document.querySelector("#clear-button"),
  previewGrid: document.querySelector("#preview-grid"),
  emptyState: document.querySelector("#empty-state"),
  statusLine: document.querySelector("#status-line"),
  startNumber: document.querySelector("#start-number"),
  fontSize: document.querySelector("#font-size"),
  leftMargin: document.querySelector("#left-margin"),
  bottomMargin: document.querySelector("#bottom-margin"),
  gradientTop: document.querySelector("#gradient-top"),
  gradientBottom: document.querySelector("#gradient-bottom"),
  shadowSpread: document.querySelector("#shadow-spread"),
  shadowLayers: document.querySelector("#shadow-layers"),
  shadowOpacity: document.querySelector("#shadow-opacity"),
  shadowBoost: document.querySelector("#shadow-boost"),
};

await ensureFontReady();
bindEvents();
render();

function bindEvents() {
  ui.fileInput.addEventListener("change", handleFileSelection);
  ui.processButton.addEventListener("click", processFiles);
  ui.downloadButton.addEventListener("click", downloadZip);
  ui.clearButton.addEventListener("click", clearAll);
}

async function ensureFontReady() {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
}

function handleFileSelection(event) {
  const selected = Array.from(event.target.files ?? [])
    .filter((file) => file.type.startsWith("image/"))
    .sort((a, b) => naturalCompare(a.name, b.name));

  const merged = [...state.files];
  for (const file of selected) {
    if (!merged.some((entry) => entry.name === file.name && entry.size === file.size)) {
      merged.push(file);
    }
  }

  merged.sort((a, b) => naturalCompare(a.name, b.name));
  state.files = merged;
  state.results = [];
  revokeZipUrl();
  ui.fileInput.value = "";
  render();
}

async function processFiles() {
  if (state.files.length === 0) {
    setStatus("Pick at least one image first.");
    return;
  }

  revokeZipUrl();
  state.results = [];
  ui.downloadButton.disabled = true;
  setStatus("Preparing previews...");
  render();

  const settings = getSettings();
  const results = [];

  for (let index = 0; index < state.files.length; index += 1) {
    const file = state.files[index];
    const number = settings.startNumber + index;
    setStatus(`Rendering ${index + 1}/${state.files.length}: ${file.name}`);

    const image = await loadImage(file);
    const rendered = await renderNumberedImage(image, file, number, settings);
    results.push(rendered);

    state.results = [...results];
    render();
    await nextFrame();
  }

  setStatus(`Ready. Processed ${state.results.length} image${state.results.length === 1 ? "" : "s"}.`);
  ui.downloadButton.disabled = state.results.length === 0;
}

function getSettings() {
  return {
    ...DEFAULTS,
    startNumber: readNumber(ui.startNumber, DEFAULTS.startNumber),
    baseFontSize: readNumber(ui.fontSize, DEFAULTS.baseFontSize),
    leftMargin: readNumber(ui.leftMargin, DEFAULTS.leftMargin),
    bottomMargin: readNumber(ui.bottomMargin, DEFAULTS.bottomMargin),
    gradientTop: ui.gradientTop.value || DEFAULTS.gradientTop,
    gradientBottom: ui.gradientBottom.value || DEFAULTS.gradientBottom,
    shadowSpread: readNumber(ui.shadowSpread, DEFAULTS.shadowSpread),
    shadowLayers: Math.max(1, Math.round(readNumber(ui.shadowLayers, DEFAULTS.shadowLayers))),
    shadowOpacity: clamp(Math.round(readNumber(ui.shadowOpacity, DEFAULTS.shadowOpacity)), 0, 255),
    shadowBoost: readNumber(ui.shadowBoost, DEFAULTS.shadowBoost),
  };
}

async function renderNumberedImage(image, file, number, settings) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0);

  const scale = Math.min(canvas.width / settings.referenceWidth, canvas.height / settings.referenceHeight);
  let fontSize = settings.baseFontSize * scale;
  const leftMargin = settings.leftMargin * scale;
  const bottomMargin = settings.bottomMargin * scale;
  const textValue = String(number);

  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  let metrics = measureTextBox(ctx, textValue, fontSize, settings.fontFamily);
  while ((metrics.width > canvas.width * settings.maxWidthRatio || metrics.height > canvas.height * settings.maxHeightRatio) && fontSize > 8) {
    fontSize -= 2;
    metrics = measureTextBox(ctx, textValue, fontSize, settings.fontFamily);
  }

  const x = leftMargin;
  const y = canvas.height - bottomMargin;
  const strokeWidth = Math.max(1, settings.strokeWidth * scale);

  drawLayeredShadow(ctx, textValue, x, y, fontSize, settings, scale);

  const gradient = ctx.createLinearGradient(0, y - metrics.ascent, 0, y + metrics.descent);
  gradient.addColorStop(0, settings.gradientTop);
  gradient.addColorStop(1, settings.gradientBottom);

  ctx.font = `${fontSize}px ${settings.fontFamily}`;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = settings.strokeColor;
  ctx.fillStyle = gradient;
  ctx.strokeText(textValue, x, y);
  ctx.fillText(textValue, x, y);

  const blob = await canvasToBlob(canvas, file.type || "image/png");
  const objectUrl = URL.createObjectURL(blob);

  return {
    fileName: file.name,
    outputName: file.name,
    blob,
    objectUrl,
    width: canvas.width,
    height: canvas.height,
    number,
  };
}

function drawLayeredShadow(ctx, textValue, x, y, fontSize, settings, scale) {
  ctx.font = `${fontSize}px ${settings.fontFamily}`;
  const spread = Math.max(1, settings.shadowSpread * scale);
  const dropY = settings.shadowBoost * scale;

  for (let layer = settings.shadowLayers; layer >= 1; layer -= 1) {
    const progress = layer / settings.shadowLayers;
    const alpha = Math.round(settings.shadowOpacity * progress);
    const xJitter = spread * progress * 0.22;
    const yJitter = spread * progress * 0.16;
    const falloffY = dropY * progress;

    ctx.fillStyle = hexToRgba(settings.shadowColor, alpha / 255);
    const offsets = [
      [settings.shadowX, settings.shadowY + falloffY],
      [settings.shadowX - xJitter, settings.shadowY + falloffY + (yJitter * 0.35)],
      [settings.shadowX + xJitter, settings.shadowY + falloffY + (yJitter * 0.35)],
      [settings.shadowX, settings.shadowY + falloffY + yJitter],
    ];

    for (const [dx, dy] of offsets) {
      ctx.fillText(textValue, x + dx, y + dy);
    }
  }
}

function measureTextBox(ctx, text, fontSize, fontFamily) {
  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.72;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.18;

  return {
    width: metrics.width,
    ascent,
    descent,
    height: ascent + descent,
  };
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch (error) {
    const fallbackImage = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    return fallbackImage;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export image."));
        return;
      }

      resolve(blob);
    }, normalizeMimeType(type), 0.98);
  });
}

function normalizeMimeType(type) {
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/bmp") {
    return type;
  }

  return "image/png";
}

async function downloadZip() {
  if (state.results.length === 0) {
    setStatus("Nothing to download yet.");
    return;
  }

  setStatus("Packing ZIP...");
  const entries = [];

  for (const result of state.results) {
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    entries.push({
      name: result.outputName,
      data: bytes,
      date: new Date(),
    });
  }

  const zipBlob = createZip(entries);
  revokeZipUrl();
  state.zipBlobUrl = URL.createObjectURL(zipBlob);

  const link = document.createElement("a");
  link.href = state.zipBlobUrl;
  link.download = "numbered-screenshots.zip";
  link.click();
  setStatus("ZIP ready and download started.");
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const dateBits = msDosDateTime(entry.date);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dateBits.time, true);
    localView.setUint16(12, dateBits.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dateBits.time, true);
    centralView.setUint16(14, dateBits.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader], { type: "application/zip" });
}

function msDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }

  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function render() {
  const hasResults = state.results.length > 0;
  const hasFiles = state.files.length > 0;

  ui.previewGrid.hidden = !hasResults;
  ui.emptyState.hidden = hasResults;
  ui.downloadButton.disabled = !hasResults;

  if (!hasResults) {
    ui.emptyState.innerHTML = `<p>${hasFiles ? "Tap “Generate preview” to render the selected screenshots." : "Processed previews will appear here."}</p>`;
  }

  ui.previewGrid.replaceChildren(...state.results.map(createPreviewCard));
}

function createPreviewCard(result) {
  const card = document.createElement("article");
  card.className = "preview-card";

  const header = document.createElement("header");
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  const subtitle = document.createElement("p");
  const pill = document.createElement("span");
  pill.className = "meta-pill";
  pill.textContent = `#${result.number}`;
  title.textContent = result.fileName;
  subtitle.textContent = `${result.width} x ${result.height}`;
  titleWrap.append(title, subtitle);
  header.append(titleWrap, pill);

  const frame = document.createElement("div");
  frame.className = "image-frame";
  const image = document.createElement("img");
  image.src = result.objectUrl;
  image.alt = result.fileName;
  frame.append(image);

  const download = document.createElement("a");
  download.className = "download-link";
  download.href = result.objectUrl;
  download.download = result.outputName;
  download.textContent = "Download image";

  card.append(header, frame, download);
  return card;
}

function clearAll() {
  for (const result of state.results) {
    URL.revokeObjectURL(result.objectUrl);
  }

  state.files = [];
  state.results = [];
  revokeZipUrl();
  ui.fileInput.value = "";
  setStatus("Cleared.");
  render();
}

function revokeZipUrl() {
  if (state.zipBlobUrl) {
    URL.revokeObjectURL(state.zipBlobUrl);
    state.zipBlobUrl = null;
  }
}

function setStatus(message) {
  ui.statusLine.textContent = message;
}

function readNumber(input, fallback) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
