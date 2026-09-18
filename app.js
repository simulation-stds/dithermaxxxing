const NABU_PALETTE = {
  shadowColor: "#0d0d0d",
  midColor: "#00ff48",
  highlightColor: "#8cf2c3"
};

const controls = {
  imageInput: document.getElementById("imageInput"),
  dropzone: document.getElementById("dropzone"),
  fitMode: document.getElementById("fitMode"),
  sizePreset: document.getElementById("sizePreset"),
  outputSize: document.getElementById("outputSize"),
  outputWidth: document.getElementById("outputWidth"),
  outputHeight: document.getElementById("outputHeight"),
  pixelScale: document.getElementById("pixelScale"),
  bayerSize: document.getElementById("bayerSize"),
  ditherStrength: document.getElementById("ditherStrength"),
  posterizeLevels: document.getElementById("posterizeLevels"),
  blackPoint: document.getElementById("blackPoint"),
  whitePoint: document.getElementById("whitePoint"),
  gamma: document.getElementById("gamma"),
  contrast: document.getElementById("contrast"),
  brightness: document.getElementById("brightness"),
  downloadPng: document.getElementById("downloadPng"),
  copyPng: document.getElementById("copyPng"),
  savePreset: document.getElementById("savePreset"),
  loadPresetButton: document.getElementById("loadPresetButton"),
  loadPreset: document.getElementById("loadPreset")
};

const sourceCanvas = document.getElementById("sourceCanvas");
const previewCanvas = document.getElementById("previewCanvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const previewCtx = previewCanvas.getContext("2d");
const emptyState = document.getElementById("emptyState");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");

let sourceImage = null;
let sourceName = "";
let renderQueued = false;
const bayerCache = new Map();

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function getNumber(id) {
  return Number(controls[id].value);
}

function getPixelSize() {
  return 2 ** getNumber("pixelScale");
}

const SIZE_RATIOS = { square: 1, horizontal: 16 / 9, vertical: 9 / 16 };
const OUTPUT_SIZES = {
  square: [[512, 512], [1024, 1024], [2048, 2048]],
  horizontal: [[1280, 720], [1920, 1080], [2560, 1440]],
  vertical: [[720, 1280], [1080, 1920], [1440, 2560]]
};
let lastDimension = "outputWidth";

function populateSizes(selection = "1") {
  const sizes = OUTPUT_SIZES[controls.sizePreset.value] || [];
  controls.outputSize.replaceChildren();
  sizes.forEach(([width, height], index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${width} x ${height}`;
    controls.outputSize.appendChild(option);
  });
  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom";
  controls.outputSize.appendChild(custom);
  controls.outputSize.value = sizes[Number(selection)] ? selection : "custom";
  document.getElementById("customDimensions").hidden = controls.outputSize.value !== "custom";
}

function applyOutputSize() {
  const size = (OUTPUT_SIZES[controls.sizePreset.value] || [])[controls.outputSize.value];
  document.getElementById("customDimensions").hidden = Boolean(size);
  if (size) {
    [controls.outputWidth.value, controls.outputHeight.value] = size;
    queueRender();
  } else {
    syncDimensions(lastDimension, true);
  }
}

function syncDimensions(id = lastDimension, commit = false) {
  const ratio = SIZE_RATIOS[controls.sizePreset.value];
  const multiplier = id === "outputWidth" ? 1 / ratio : ratio;
  const min = ratio ? Math.ceil(Math.max(8, 8 / multiplier)) : 8;
  const max = ratio ? Math.floor(Math.min(4096, 4096 / multiplier)) : 4096;
  const value = getNumber(id);
  // Leave incomplete typing alone; normalize both dimensions when committed.
  if (!commit && (!Number.isInteger(value) || value < min || value > max)) {
    return;
  }
  const dimension = Math.round(clamp(value, min, max));
  controls[id].value = dimension;
  if (ratio) {
    const other = id === "outputWidth" ? "outputHeight" : "outputWidth";
    controls[other].value = Math.round(dimension * multiplier);
  }
  queueRender();
}

function getSettings() {
  return {
    fitMode: controls.fitMode.value,
    sizePreset: controls.sizePreset.value,
    outputSize: controls.outputSize.value,
    outputWidth: Math.round(clamp(getNumber("outputWidth"), 8, 4096)),
    outputHeight: Math.round(clamp(getNumber("outputHeight"), 8, 4096)),
    pixelScale: getPixelSize(),
    bayerSize: getNumber("bayerSize"),
    ditherStrength: getNumber("ditherStrength"),
    posterizeLevels: getNumber("posterizeLevels"),
    blackPoint: getNumber("blackPoint"),
    whitePoint: getNumber("whitePoint"),
    gamma: getNumber("gamma"),
    contrast: getNumber("contrast"),
    brightness: getNumber("brightness")
  };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function updateValueLabels() {
  document.querySelectorAll("[data-value-for]").forEach((node) => {
    const id = node.dataset.valueFor;
    const value = controls[id].value;
    if (id === "pixelScale") {
      node.textContent = `${2 ** Number(value)}x`;
      return;
    }
    node.textContent = id === "posterizeLevels" ? value : Number(value).toFixed(2);
  });
}

function setExportEnabled(enabled) {
  controls.downloadPng.disabled = !enabled;
  controls.copyPng.disabled = !enabled;
}

function makeBayer(size) {
  if (bayerCache.has(size)) {
    return bayerCache.get(size);
  }

  let matrix = [[0, 2], [3, 1]];
  while (matrix.length < size) {
    const n = matrix.length;
    const next = Array.from({ length: n * 2 }, () => Array(n * 2).fill(0));
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const value = matrix[y][x] * 4;
        next[y][x] = value;
        next[y][x + n] = value + 2;
        next[y + n][x] = value + 3;
        next[y + n][x + n] = value + 1;
      }
    }
    matrix = next;
  }

  const divisor = size * size;
  const normalized = matrix.map((row) => row.map((value) => (value + 0.5) / divisor));
  bayerCache.set(size, normalized);
  return normalized;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function mixRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

function mapPalette(luma) {
  const shadow = hexToRgb(NABU_PALETTE.shadowColor);
  const mid = hexToRgb(NABU_PALETTE.midColor);
  const highlight = hexToRgb(NABU_PALETTE.highlightColor);
  const value = luma;

  if (value <= 0.5) {
    return mixRgb(shadow, mid, value / 0.5);
  }
  return mixRgb(mid, highlight, (value - 0.5) / 0.5);
}

function computeDrawRect(image, width, height, fitMode) {
  if (fitMode === "original") {
    return {
      x: Math.round((width - image.naturalWidth) / 2),
      y: Math.round((height - image.naturalHeight) / 2),
      w: image.naturalWidth,
      h: image.naturalHeight
    };
  }

  const scale = fitMode === "cover"
    ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
    : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = Math.round(image.naturalWidth * scale);
  const h = Math.round(image.naturalHeight * scale);
  return {
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
    w,
    h
  };
}

function rasterizeSource(settings, sampleWidth, sampleHeight) {
  sourceCanvas.width = sampleWidth;
  sourceCanvas.height = sampleHeight;
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.fillStyle = "#000";
  sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.imageSmoothingQuality = "high";

  const rect = computeDrawRect(sourceImage, sampleWidth, sampleHeight, settings.fitMode);
  sourceCtx.drawImage(sourceImage, rect.x, rect.y, rect.w, rect.h);
}

function toneLuma(r, g, b, settings) {
  let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const range = Math.max(0.001, settings.whitePoint - settings.blackPoint);

  luma = clamp((luma - settings.blackPoint) / range);
  luma = clamp((luma - 0.5) * (1 + settings.contrast) + 0.5 + settings.brightness);
  return Math.pow(luma, 1 / Math.max(0.001, settings.gamma));
}

function ditherAndPosterize(luma, settings, x, y, bayer) {
  const zoom = Math.max(1, Math.round(settings.pixelScale));
  const matrixX = Math.floor(x / zoom) % settings.bayerSize;
  const matrixY = Math.floor(y / zoom) % settings.bayerSize;
  const threshold = bayer[matrixY][matrixX];
  luma = clamp(luma + (threshold - 0.5) * settings.ditherStrength);

  const steps = Math.max(2, settings.posterizeLevels);
  return Math.round(luma * (steps - 1)) / (steps - 1);
}

function render() {
  renderQueued = false;
  updateValueLabels();

  if (!sourceImage) {
    return;
  }

  const settings = getSettings();
  if (settings.whitePoint <= settings.blackPoint) {
    setStatus("White point must be above black point.", true);
    setExportEnabled(false);
    return;
  }

  const finalWidth = settings.outputWidth;
  const finalHeight = settings.outputHeight;
  const sampleWidth = Math.ceil(finalWidth / settings.pixelScale);
  const sampleHeight = Math.ceil(finalHeight / settings.pixelScale);

  if (finalWidth > 16384 || finalHeight > 16384 || finalWidth * finalHeight > 64000000) {
    setStatus("Reduce output size for this browser canvas.", true);
    setExportEnabled(false);
    return;
  }

  rasterizeSource(settings, sampleWidth, sampleHeight);

  const src = sourceCtx.getImageData(0, 0, sampleWidth, sampleHeight);
  const output = previewCtx.createImageData(finalWidth, finalHeight);
  const bayer = makeBayer(settings.bayerSize);

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const sourceIndex = (y * sampleWidth + x) * 4;
      const alpha = src.data[sourceIndex + 3];
      const tonedLuma = toneLuma(
        src.data[sourceIndex],
        src.data[sourceIndex + 1],
        src.data[sourceIndex + 2],
        settings
      );

      for (let sy = 0; sy < settings.pixelScale; sy += 1) {
        const outY = y * settings.pixelScale + sy;
        if (outY >= finalHeight) {
          continue;
        }
        for (let sx = 0; sx < settings.pixelScale; sx += 1) {
          const outX = x * settings.pixelScale + sx;
          if (outX >= finalWidth) {
            continue;
          }
          const luma = ditherAndPosterize(tonedLuma, settings, outX, outY, bayer);
          const color = mapPalette(luma);
          const outIndex = (outY * finalWidth + outX) * 4;
          output.data[outIndex] = color.r;
          output.data[outIndex + 1] = color.g;
          output.data[outIndex + 2] = color.b;
          output.data[outIndex + 3] = alpha;
        }
      }
    }
  }

  previewCanvas.width = finalWidth;
  previewCanvas.height = finalHeight;
  previewCtx.putImageData(output, 0, 0);
  previewCanvas.hidden = false;
  emptyState.hidden = true;
  setExportEnabled(true);
  setStatus("Rendered.");
  updateMeta(settings);
}

function queueRender() {
  if (renderQueued) {
    return;
  }
  renderQueued = true;
  requestAnimationFrame(render);
}

function updateMeta(settings) {
  metaEl.innerHTML = "";
  [
    sourceName || "Image",
    `${sourceImage.naturalWidth}x${sourceImage.naturalHeight} source`,
    `${previewCanvas.width}x${previewCanvas.height} PNG`,
    `${settings.pixelScale}x pixels`,
    `${settings.bayerSize}x${settings.bayerSize} Bayer`,
    `${settings.posterizeLevels} levels`
  ].forEach((text) => {
    const node = document.createElement("span");
    node.className = "pill";
    node.textContent = text;
    metaEl.appendChild(node);
  });
}

async function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Choose an image file.", true);
    return;
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    sourceImage = image;
    sourceName = file.name;
    setStatus(`Loaded ${file.name}.`);
    queueRender();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Could not load that image.", true);
  };
  image.src = url;
}

function downloadPng() {
  if (!sourceImage) {
    return;
  }

  previewCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("PNG export failed.", true);
      return;
    }
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const base = sourceName.replace(/\.[^.]+$/, "") || "dithermaxxxing";
    link.href = url;
    link.download = `${base}-dithermaxxxing.png`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("PNG downloaded.");
  }, "image/png");
}

async function copyPng() {
  if (!sourceImage) {
    return;
  }

  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    setStatus("Clipboard image copy is not available in this browser.", true);
    return;
  }

  previewCanvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("PNG copied to clipboard.");
    } catch (error) {
      setStatus("Clipboard permission was denied.", true);
    }
  }, "image/png");
}

function savePreset() {
  const preset = {
    version: 1,
    app: "Dithermaxxxing",
    settings: getSettings()
  };
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dithermaxxxing-preset.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Preset JSON saved.");
}

async function loadPreset(file) {
  if (!file) {
    return;
  }

  try {
    const data = JSON.parse(await file.text());
    const settings = data.settings || data;
    Object.entries(settings).forEach(([key, value]) => {
      if (!(key in controls)) {
        return;
      }

      const control = controls[key];
      if (control.type === "checkbox") {
        control.checked = Boolean(value);
      } else if (key === "pixelScale") {
        control.value = Math.round(Math.log2(clamp(Number(value), 1, 32)));
      } else {
        control.value = value;
      }
    });
    controls.sizePreset.value = Object.hasOwn(SIZE_RATIOS, settings.sizePreset)
      ? settings.sizePreset : "custom";
    lastDimension = "outputWidth";
    syncDimensions(lastDimension, true);
    const sizes = OUTPUT_SIZES[controls.sizePreset.value] || [];
    const match = sizes.findIndex(([w, h]) => w === getNumber("outputWidth") && h === getNumber("outputHeight"));
    populateSizes(settings.outputSize === "custom" || match < 0 ? "custom" : String(match));
    updateValueLabels();
    setStatus("Preset loaded.");
    queueRender();
  } catch (error) {
    setStatus("Preset JSON could not be read.", true);
  } finally {
    controls.loadPreset.value = "";
  }
}

controls.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  controls.dropzone.classList.add("is-over");
});

controls.dropzone.addEventListener("dragleave", () => {
  controls.dropzone.classList.remove("is-over");
});

controls.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  controls.dropzone.classList.remove("is-over");
  loadImageFile(event.dataTransfer.files[0]);
});

controls.imageInput.addEventListener("change", (event) => {
  loadImageFile(event.target.files[0]);
});

controls.sizePreset.addEventListener("change", () => {
  populateSizes(controls.outputSize.value);
  applyOutputSize();
});
controls.outputSize.addEventListener("change", applyOutputSize);
["outputWidth", "outputHeight"].forEach((id) => {
  controls[id].addEventListener("input", () => {
    lastDimension = id;
    syncDimensions(id);
  });
  controls[id].addEventListener("change", () => syncDimensions(id, true));
});

Object.entries(controls).forEach(([id, control]) => {
  if (["sizePreset", "outputSize", "outputWidth", "outputHeight"].includes(id)) return;
  if (!control || ["imageInput", "dropzone", "downloadPng", "copyPng", "savePreset", "loadPresetButton", "loadPreset"].includes(id)) {
    return;
  }
  control.addEventListener("input", queueRender);
  control.addEventListener("change", queueRender);
});

controls.downloadPng.addEventListener("click", downloadPng);
controls.copyPng.addEventListener("click", copyPng);
controls.savePreset.addEventListener("click", savePreset);
controls.loadPresetButton.addEventListener("click", () => controls.loadPreset.click());
controls.loadPreset.addEventListener("change", (event) => loadPreset(event.target.files[0]));

updateValueLabels();
setExportEnabled(false);
