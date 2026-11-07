
const $ = (selector) => document.querySelector(selector);

// Only the Electron preload exposes the update controls.
if (window.desktop?.updates) {
  const controls = $("#appUpdates");
  const button = $("#updateButton");
  const status = $("#updateStatus");
  let updateState;
  const renderUpdate = (state) => {
    updateState = state;
    controls.classList.remove("hidden");
    button.disabled = ["checking", "downloading", "unsupported"].includes(state.status);
    button.textContent = state.status === "available" ? "Download update"
      : state.status === "downloaded" ? "Restart and install" : "Check for updates";
    const messages = {
      idle: `Version ${state.currentVersion}`,
      checking: "Checking for updates...",
      current: `Version ${state.currentVersion} is up to date.`,
      available: `Version ${state.version} is available.`,
      downloading: `Downloading update: ${state.percent ?? 0}%`,
      downloaded: `Version ${state.version} is ready to install.`
    };
    status.textContent = state.message || messages[state.status] || "";
  };
  const unsubscribe = window.desktop.updates.onState(renderUpdate);
  window.desktop.updates.getState().then(renderUpdate).catch(() => {
    status.textContent = "Update controls are unavailable. Restart the app.";
  });
  button.addEventListener("click", async () => {
    if (updateState?.status === "downloaded" &&
        !window.confirm("Restart ClearCut to install the update? Finish any image processing and save your PNG first.")) return;
    button.disabled = true;
    try {
      renderUpdate(await window.desktop.updates.act());
    } catch {
      renderUpdate({ status: "error", message: "Could not check for updates. Please try again." });
    }
  });
  window.addEventListener("beforeunload", unsubscribe, { once: true });
}

const fileTab = $("#fileTab");
const urlTab = $("#urlTab");
const filePanel = $("#filePanel");
const urlForm = $("#urlForm");
const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const statusBox = $("#status");
const resultSection = $("#result");
const originalImage = $("#originalImage");
const resultImage = $("#resultImage");
const downloadBtn = $("#downloadBtn");
const resetBtn = $("#resetBtn");

const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

let originalObjectURL = null;
let resultObjectURL = null;
let requestController = null;
let requestId = 0;
let isProcessing = false;

// --------------------------------------------------
// UI HELPERS
// --------------------------------------------------

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
}

function setBusy(busy) {
  isProcessing = busy;

  fileInput.disabled = busy;
  $("#imageUrl").disabled = busy;

  fileTab.disabled = busy;
  urlTab.disabled = busy;

  dropzone.style.pointerEvents = busy ? "none" : "";
  dropzone.style.opacity = busy ? "0.55" : "";

  urlForm.querySelector("button").disabled = busy;
}

function clearPreviews() {
  if (originalObjectURL) {
    URL.revokeObjectURL(originalObjectURL);
  }

  if (resultObjectURL) {
    URL.revokeObjectURL(resultObjectURL);
  }

  originalObjectURL = null;
  resultObjectURL = null;

  originalImage.removeAttribute("src");
  resultImage.removeAttribute("src");

  downloadBtn.removeAttribute("href");

  resultSection.classList.add("hidden");
}

// --------------------------------------------------
// TAB MANAGEMENT
// --------------------------------------------------

function switchTab(mode) {
  const useURL = mode === "url";

  filePanel.classList.toggle("hidden", useURL);
  urlForm.classList.toggle("hidden", !useURL);

  fileTab.classList.toggle("active", !useURL);
  urlTab.classList.toggle("active", useURL);

  fileTab.setAttribute("aria-selected", String(!useURL));
  urlTab.setAttribute("aria-selected", String(useURL));

  setStatus(
    useURL
      ? "Colle l'URL publique de ton image."
      : "Choisis une image pour commencer."
  );
}

fileTab.addEventListener("click", () => switchTab("file"));
urlTab.addEventListener("click", () => switchTab("url"));

// --------------------------------------------------
// FILE VALIDATION
// --------------------------------------------------

function validateFile(file) {
  if (!file) {
    return "Aucun fichier sélectionné.";
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Format non accepté. Utilise un fichier JPG, PNG ou WEBP.";
  }

  if (file.size > MAX_SIZE) {
    return "L'image dépasse la limite de 10 Mo.";
  }

  if (file.size === 0) {
    return "Le fichier est vide.";
  }

  return null;
}

// --------------------------------------------------
// API ERROR HANDLING
// --------------------------------------------------

async function readError(response) {
  try {
    const data = await response.json();

    return data.detail || `Erreur HTTP ${response.status}`;
  } catch {
    return `Erreur HTTP ${response.status}`;
  }
}

// --------------------------------------------------
// IMAGE PROCESSING
// --------------------------------------------------

async function processImage({ file, url }) {
  if (isProcessing) return;

  const error = file ? validateFile(file) : null;

  if (error) {
    setStatus(error, "error");
    return;
  }

  // Clear previous results
  clearPreviews();

  // Create a unique request ID
  const currentRequest = ++requestId;

  // Abort previous request if necessary
  requestController?.abort();

  requestController = new AbortController();

  setBusy(true);

  setStatus("Suppression de l'arrière-plan en cours…");

  // Display original image immediately
  if (file) {
    originalObjectURL = URL.createObjectURL(file);
    originalImage.src = originalObjectURL;
  } else {
    originalImage.removeAttribute("src");
  }

  try {
    let response;

    // Upload local image
    if (file) {
      const formData = new FormData();

      formData.append("file", file);

      response = await fetch("/api/remove-bg", {
        method: "POST",
        body: formData,
        signal: requestController.signal,
      });
    }

    // Process remote image URL
    else {
      response = await fetch("/api/remove-bg-from-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
        signal: requestController.signal,
      });
    }

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const blob = await response.blob();

    if (!blob.type.includes("image/png")) {
      throw new Error(
        "Le serveur n'a pas renvoyé un PNG valide."
      );
    }

    // Ignore outdated requests
    if (currentRequest !== requestId) return;

    // Create result preview
    resultObjectURL = URL.createObjectURL(blob);

    resultImage.src = resultObjectURL;
    downloadBtn.href = resultObjectURL;

    // Display remote original image
    if (!file) {
      originalImage.alt = "Image source fournie par URL";
      originalImage.src = url;

      originalImage.onerror = () => {
        originalImage.removeAttribute("src");
        originalImage.alt = "Aperçu source indisponible";
      };
    }

    // Display result section
    resultSection.classList.remove("hidden");

    setStatus(
      "Arrière-plan supprimé avec succès.",
      "success"
    );

  } catch (error) {
    if (error.name === "AbortError") return;

    if (currentRequest === requestId) {
      setStatus(
        error.message || "Une erreur est survenue.",
        "error"
      );
    }

  } finally {
    if (currentRequest === requestId) {
      setBusy(false);
      requestController = null;
    }
  }
}

// --------------------------------------------------
// NORMAL FILE INPUT
// --------------------------------------------------

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];

  if (file) {
    processImage({ file });
  }

  // Allow selecting the same file again
  fileInput.value = "";
});

// --------------------------------------------------
// DRAG AND DROP
// --------------------------------------------------

dropzone.addEventListener("dragenter", (event) => {
  event.preventDefault();

  if (!isProcessing) {
    dropzone.classList.add("dragging");
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();

  if (!isProcessing) {
    event.dataTransfer.dropEffect = "copy";
    dropzone.classList.add("dragging");
  }
});

dropzone.addEventListener("dragleave", (event) => {
  event.preventDefault();

  dropzone.classList.remove("dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();

  dropzone.classList.remove("dragging");

  if (isProcessing) return;

  const file = event.dataTransfer.files?.[0];

  if (!file) {
    setStatus("Aucun fichier détecté.", "error");
    return;
  }

  processImage({ file });
});

// Prevent browser from opening dropped files
// outside the dropzone
window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
});

// --------------------------------------------------
// IMAGE URL FORM
// --------------------------------------------------

urlForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const url = $("#imageUrl").value.trim();

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Utilise une URL HTTP ou HTTPS.");
    }

    processImage({ url: parsed.href });

  } catch (error) {
    setStatus(
      error instanceof TypeError
        ? "Entre une URL valide."
        : error.message,
      "error"
    );
  }
});

// --------------------------------------------------
// RESET
// --------------------------------------------------

resetBtn.addEventListener("click", () => {
  requestId++;

  requestController?.abort();
  requestController = null;

  setBusy(false);

  clearPreviews();

  $("#imageUrl").value = "";
  fileInput.value = "";

  switchTab("file");

  setStatus("Choisis une image pour commencer.");
});

// --------------------------------------------------
// CLEANUP
// --------------------------------------------------

window.addEventListener("beforeunload", () => {
  requestController?.abort();

  clearPreviews();
});


// --------------------------------------------------
// CLIPBOARD IMAGE (CTRL + V)
// --------------------------------------------------

document.addEventListener("paste", (event) => {
  if (isProcessing) return;

  const clipboardItems = event.clipboardData?.items;

  if (!clipboardItems) return;

  // Find the first image in the clipboard
  const imageItem = Array.from(clipboardItems).find((item) =>
    item.type.startsWith("image/")
  );

  // No image found: let normal paste behavior continue
  if (!imageItem) return;

  event.preventDefault();

  const file = imageItem.getAsFile();

  if (!file) {
    setStatus("Impossible de récupérer l'image du presse-papier.", "error");
    return;
  }

  // Clipboard images sometimes have no filename
  const extension = file.type.split("/")[1] || "png";

  const imageFile = new File(
    [file],
    `clipboard-image.${extension}`,
    { type: file.type }
  );

  // Reuse existing validation and processing
  processImage({ file: imageFile });
});
