(function () {
  const SESSION_KEY = "zachLewisPortfolioUnlocked";
  const grid = document.querySelector("#sample-grid");
  const unlockForm = document.querySelector("#unlock-form");
  const lockButton = document.querySelector("#lock-button");
  const passphraseInput = document.querySelector("#passphrase");
  const statusMessage = document.querySelector("#status-message");
  const data = window.PORTFOLIO_DATA || { samples: [] };
  let activePassphrase = "";
  let privateMetadata = null;
  let blobUrls = [];

  function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.dataset.type = type || "";
  }

  function isUnlocked() {
    return Boolean(activePassphrase && sessionStorage.getItem(SESSION_KEY) === "true");
  }

  function revokeBlobUrls() {
    blobUrls.forEach((url) => URL.revokeObjectURL(url));
    blobUrls = [];
  }

  function renderSamples() {
    const unlocked = isUnlocked();
    grid.innerHTML = "";

    data.samples.forEach((sample) => {
      const displaySample = unlocked ? mergePrivateSampleData(sample) : sample;
      const card = document.createElement("article");
      card.className = "sample-card";

      const state = document.createElement("span");
      state.className = `state-pill${unlocked ? " unlocked" : ""}`;
      state.textContent = unlocked ? "Unlocked" : "Locked";

      const tags = displaySample.tags
        .map((tag) => `<li>${escapeHtml(tag)}</li>`)
        .join("");

      card.innerHTML = `
        <div>
          <div class="sample-meta">
            <span class="client-label">${escapeHtml(displaySample.client)}</span>
          </div>
          <h3>${escapeHtml(displaySample.title)}</h3>
          <p>${escapeHtml(displaySample.description)}</p>
          <div class="sample-facts">
            <span><strong>Format:</strong> ${escapeHtml(displaySample.format)}</span>
            <span><strong>Audience:</strong> ${escapeHtml(displaySample.audience)}</span>
          </div>
          <ul class="tag-list">${tags}</ul>
        </div>
      `;

      card.querySelector(".sample-meta").appendChild(state);

      const button = document.createElement("button");
      button.className = "button";
      button.type = "button";
      button.textContent = unlocked ? "Open decrypted sample" : "Unlock to view";
      button.disabled = !unlocked;
      button.addEventListener("click", () => viewSample(displaySample, button));
      card.appendChild(button);

      grid.appendChild(card);
    });

    renderExperience();
  }

  function mergePrivateSampleData(sample) {
    const privateSample = privateMetadata?.samples?.[sample.id];
    return privateSample ? { ...sample, ...privateSample } : sample;
  }

  function renderExperience() {
    const unlocked = isUnlocked();
    document.querySelectorAll("[data-client-key]").forEach((item) => {
      const key = item.getAttribute("data-client-key");
      const privateExperience = unlocked ? privateMetadata?.experience?.[key] : null;
      const name = privateExperience?.name || item.getAttribute("data-public-name") || "Locked client";
      const detail = privateExperience?.detail || item.getAttribute("data-public-detail") || "";
      const status = privateExperience?.status || item.getAttribute("data-public-status") || "Name locked";

      const nameEl = item.querySelector("[data-client-name]");
      const detailEl = item.querySelector("[data-client-detail]");
      const statusEl = item.querySelector("[data-client-status]");

      if (nameEl) nameEl.textContent = name;
      if (detailEl) detailEl.textContent = detail;
      if (statusEl) {
        statusEl.textContent = status;
        statusEl.classList.toggle("unlocked", Boolean(privateExperience));
      }
      item.classList.toggle("unlocked", Boolean(privateExperience));
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  async function deriveKey(passphrase, salt, iterations) {
    const encoded = new TextEncoder().encode(passphrase);
    const keyMaterial = await crypto.subtle.importKey("raw", encoded, "PBKDF2", false, [
      "deriveKey",
    ]);

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: base64ToArrayBuffer(salt),
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function decryptAsset(asset, passphrase) {
    const response = await fetch(asset.encryptedFile, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Encrypted asset could not be loaded: ${asset.encryptedFile}`);
    }

    const encryptedBytes = await response.arrayBuffer();
    const key = await deriveKey(passphrase, asset.salt, asset.iterations || data.iterations);

    return crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToArrayBuffer(asset.iv),
      },
      key,
      encryptedBytes
    );
  }

  async function decryptSample(sample, passphrase) {
    return decryptAsset(sample, passphrase);
  }

  async function decryptPrivateMetadata(passphrase) {
    if (!data.privateClientMetadata?.encryptedFile) {
      return null;
    }

    const decrypted = await decryptAsset(data.privateClientMetadata, passphrase);
    const json = new TextDecoder().decode(decrypted);
    return JSON.parse(json);
  }

  async function validatePassphrase(passphrase) {
    const firstSample = data.samples.find((sample) => sample.encryptedFile && sample.salt && sample.iv);
    if (!firstSample) {
      throw new Error("No encrypted samples are available yet.");
    }
    await decryptSample(firstSample, passphrase);
  }

  async function viewSample(sample, button) {
    if (!isUnlocked()) {
      setStatus("Enter the portfolio passphrase to unlock samples.", "locked");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Opening...";

    try {
      const decrypted = await decryptSample(sample, activePassphrase);
      const blob = new Blob([decrypted], { type: sample.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.download = sample.originalFilename || `${sample.id}.sample`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setStatus(`Opened ${sample.displayLabel || sample.title}.`, "unlocked");
    } catch (error) {
      console.error(error);
      setStatus("That passphrase did not decrypt this sample.", "error");
      sessionStorage.removeItem(SESSION_KEY);
      activePassphrase = "";
      renderSamples();
    } finally {
      button.disabled = !isUnlocked();
      button.textContent = originalText;
    }
  }

  unlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!window.crypto || !crypto.subtle) {
      setStatus("This browser does not support Web Crypto.", "error");
      return;
    }

    const passphrase = passphraseInput.value;
    if (!passphrase) {
      setStatus("Enter a passphrase to unlock the portfolio.", "locked");
      return;
    }

    setStatus("Checking passphrase...", "working");

    try {
      await validatePassphrase(passphrase);
      privateMetadata = await decryptPrivateMetadata(passphrase);
      activePassphrase = passphrase;
      passphraseInput.value = "";
      sessionStorage.setItem(SESSION_KEY, "true");
      renderSamples();
      setStatus("Portfolio unlocked for this browser session.", "unlocked");
    } catch (error) {
      console.error(error);
      sessionStorage.removeItem(SESSION_KEY);
      activePassphrase = "";
      privateMetadata = null;
      renderSamples();
      setStatus("Passphrase did not unlock the portfolio.", "error");
    }
  });

  lockButton.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    activePassphrase = "";
    privateMetadata = null;
    passphraseInput.value = "";
    revokeBlobUrls();
    renderSamples();
    setStatus("Portfolio locked.", "locked");
  });

  sessionStorage.removeItem(SESSION_KEY);
  renderSamples();
})();
