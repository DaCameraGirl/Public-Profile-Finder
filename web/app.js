const form = document.querySelector("#case-form");
const flyerPreview = document.querySelector("#flyer-preview");
const previewStatus = document.querySelector("#preview-status");
const previewFlags = document.querySelector("#preview-flags");
const formWarning = document.querySelector("#form-warning");
const appStatus = document.querySelector("#app-status");
const sourceNote = document.querySelector("#source-note");
const shareButton = document.querySelector("#share-button");
const qrButton = document.querySelector("#qr-button");
const printButton = document.querySelector("#print-button");
const installButton = document.querySelector("#install-button");
const saveButton = document.querySelector("#save-button");
const clearButton = document.querySelector("#clear-button");
const demoButton = document.querySelector("#demo-button");
const checklistWrap = document.querySelector("#checklist");
const qrPopup = document.querySelector("#qr-popup");
const qrClose = document.querySelector("#qr-close");
const qrImage = document.querySelector("#qr-image");
const qrCaption = document.querySelector("#qr-caption");
const qrOpenLinkButton = document.querySelector("#qr-open-link");
const qrCopyLinkButton = document.querySelector("#qr-copy-link");

const DEPLOYED_APP_URL = "https://dacameragirl.github.io/Public-Profile-Finder/web/";
const STORAGE_KEY = "missing-person-support-case-v1";
const CHECKLIST_KEY = "missing-person-support-checklist-v1";
const SHARE_PREFIX = "#case=";
const FLYER_VIEW_PARAM = "flyer";
const GENERAL_NAMUS_URL = "https://namus.nij.ojp.gov/what-namus";
const GENERAL_NCMEC_URL = "https://us.missingkids.org/MissingChild";
const PUBLIC_URL_PATTERN = /^https?:\/\/\S+$/i;
const QR_PROVIDER_URLS = [
  (text) =>
    `https://quickchart.io/qr?size=320&margin=2&dark=102034&light=f6f0e8&text=${encodeURIComponent(text)}`,
  (text) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(text)}&color=102034&bgcolor=f6f0e8&format=svg`
];

const CHECKLIST_ITEMS = [
  {
    id: "law-enforcement",
    title: "Reported to local law enforcement",
    detail: "Use official case numbers and agency contacts on the flyer."
  },
  {
    id: "official-page",
    title: "Official public case page linked",
    detail: "Prefer a law-enforcement, NamUs, or NCMEC page when available."
  },
  {
    id: "public-photo",
    title: "Confirmed the shared photo is public and authorized",
    detail: "Only publish photos you are allowed to redistribute."
  },
  {
    id: "hospitals",
    title: "Hospitals, shelters, or relevant organizations checked",
    detail: "Keep sensitive details out of the public flyer."
  },
  {
    id: "community-share",
    title: "Shared flyer through trusted public channels",
    detail: "Route tips to official contacts only."
  }
];

const DEMO_CASE = {
  caseLabel: "Help Locate Jordan Rivera",
  caseType: "adult",
  name: "Jordan Rivera",
  nickname: "Jordy",
  age: "29",
  caseNumber: "CASE-2026-0147",
  lastSeenDate: "2026-04-17",
  lastSeenLocation: "Savannah, GA",
  summary:
    "Jordan Rivera was last publicly confirmed near downtown Savannah on April 17, 2026. Family and friends are sharing only public case details and ask that all tips go to official contacts.",
  features: "Brown eyes, shoulder-length dark hair, and a crescent-moon tattoo on the left wrist.",
  clothing: "Blue denim jacket, black jeans, white sneakers, and a canvas tote bag.",
  photoUrl: "",
  officialUrl: "",
  namusUrl: GENERAL_NAMUS_URL,
  ncmecUrl: "",
  agencyName: "Investigating Agency",
  agencyPhone: "912-555-0100",
  agencyEmail: "tips@example.gov",
  tipUrl: "",
  tipInstructions: "If you have information, contact the investigating agency directly or use the official case page."
};

const EMPTY_CASE = {
  caseLabel: "",
  caseType: "adult",
  name: "",
  nickname: "",
  age: "",
  caseNumber: "",
  lastSeenDate: "",
  lastSeenLocation: "",
  summary: "",
  features: "",
  clothing: "",
  photoUrl: "",
  officialUrl: "",
  namusUrl: "",
  ncmecUrl: "",
  agencyName: "",
  agencyPhone: "",
  agencyEmail: "",
  tipUrl: "",
  tipInstructions: ""
};

const state = {
  currentCase: null,
  deferredPrompt: null,
  checklist: loadChecklistState()
};

function isLocalRuntime() {
  return (
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
}

function isFlyerOnlyView() {
  return new URLSearchParams(window.location.search).get("view") === FLYER_VIEW_PARAM;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function formatMultiline(value) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeUrl(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) {
    return "";
  }

  if (!PUBLIC_URL_PATTERN.test(trimmed)) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizePhone(value) {
  return normalizeString(value).replace(/[^\d+().\-\s]/g, "");
}

function normalizeEmail(value) {
  return normalizeString(value);
}

function serializeCaseData(data) {
  return Object.fromEntries(
    Object.entries({
      caseLabel: data.caseLabel,
      caseType: data.caseType,
      name: data.name,
      nickname: data.nickname,
      age: data.age,
      caseNumber: data.caseNumber,
      lastSeenDate: data.lastSeenDate,
      lastSeenLocation: data.lastSeenLocation,
      summary: data.summary,
      features: data.features,
      clothing: data.clothing,
      photoUrl: data.photoUrl,
      officialUrl: data.officialUrl,
      namusUrl: data.namusUrl,
      ncmecUrl: data.ncmecUrl,
      agencyName: data.agencyName,
      agencyPhone: data.agencyPhone,
      agencyEmail: data.agencyEmail,
      tipUrl: data.tipUrl,
      tipInstructions: data.tipInstructions
    }).filter(([, value]) => value !== "")
  );
}

function readFormData() {
  const data = new FormData(form);

  return {
    caseLabel: normalizeString(data.get("caseLabel")),
    caseType: normalizeString(data.get("caseType")) || "adult",
    name: normalizeString(data.get("name")),
    nickname: normalizeString(data.get("nickname")),
    age: normalizeString(data.get("age")),
    caseNumber: normalizeString(data.get("caseNumber")),
    lastSeenDate: normalizeString(data.get("lastSeenDate")),
    lastSeenLocation: normalizeString(data.get("lastSeenLocation")),
    summary: normalizeString(data.get("summary")),
    features: normalizeString(data.get("features")),
    clothing: normalizeString(data.get("clothing")),
    photoUrl: normalizeString(data.get("photoUrl")),
    officialUrl: normalizeString(data.get("officialUrl")),
    namusUrl: normalizeString(data.get("namusUrl")),
    ncmecUrl: normalizeString(data.get("ncmecUrl")),
    agencyName: normalizeString(data.get("agencyName")),
    agencyPhone: normalizeString(data.get("agencyPhone")),
    agencyEmail: normalizeString(data.get("agencyEmail")),
    tipUrl: normalizeString(data.get("tipUrl")),
    tipInstructions: normalizeString(data.get("tipInstructions"))
  };
}

function writeFormData(data) {
  const entries = {
    caseLabel: data.caseLabel || "",
    caseType: data.caseType || "adult",
    name: data.name || "",
    nickname: data.nickname || "",
    age: data.age || "",
    caseNumber: data.caseNumber || "",
    lastSeenDate: data.lastSeenDate || "",
    lastSeenLocation: data.lastSeenLocation || "",
    summary: data.summary || "",
    features: data.features || "",
    clothing: data.clothing || "",
    photoUrl: data.photoUrl || "",
    officialUrl: data.officialUrl || "",
    namusUrl: data.namusUrl || "",
    ncmecUrl: data.ncmecUrl || "",
    agencyName: data.agencyName || "",
    agencyPhone: data.agencyPhone || "",
    agencyEmail: data.agencyEmail || "",
    tipUrl: data.tipUrl || "",
    tipInstructions: data.tipInstructions || ""
  };

  for (const [name, value] of Object.entries(entries)) {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) {
      field.value = value;
    }
  }
}

function sanitizeCaseData(raw) {
  const warnings = [];
  const data = {
    caseLabel: raw.caseLabel,
    caseType: ["adult", "child", "other"].includes(raw.caseType) ? raw.caseType : "adult",
    name: raw.name,
    nickname: raw.nickname,
    age: raw.age,
    caseNumber: raw.caseNumber,
    lastSeenDate: raw.lastSeenDate,
    lastSeenLocation: raw.lastSeenLocation,
    summary: raw.summary,
    features: raw.features,
    clothing: raw.clothing,
    photoUrl: "",
    officialUrl: "",
    namusUrl: "",
    ncmecUrl: "",
    agencyName: raw.agencyName,
    agencyPhone: normalizePhone(raw.agencyPhone),
    agencyEmail: normalizeEmail(raw.agencyEmail),
    tipUrl: "",
    tipInstructions: raw.tipInstructions
  };

  if (raw.photoUrl) {
    data.photoUrl = normalizeUrl(raw.photoUrl);
    if (!data.photoUrl) {
      warnings.push("Ignored the photo URL because it was not a valid public http(s) link.");
    }
  }

  for (const key of ["officialUrl", "namusUrl", "ncmecUrl", "tipUrl"]) {
    const normalized = normalizeUrl(raw[key]);
    if (raw[key] && !normalized) {
      warnings.push(`Ignored ${key.replace(/Url$/, " URL")} because it was not a valid public http(s) link.`);
    }
    data[key] = normalized;
  }

  return {
    data,
    warnings
  };
}

function hasShareableCase(data) {
  return Boolean(data.caseLabel || data.name || data.summary || data.officialUrl || data.agencyName);
}

function showFormWarning(message) {
  formWarning.hidden = false;
  formWarning.textContent = message;
}

function hideFormWarning() {
  formWarning.hidden = true;
  formWarning.textContent = "";
}

function saveDraft(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeCaseData(data)));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

function loadChecklistState() {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveChecklistState() {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state.checklist));
}

function syncViewMode() {
  document.body.classList.toggle("flyer-only-view", isFlyerOnlyView());
}

function buildBaseAppUrl({ flyerOnly = false } = {}) {
  const url = new URL(isLocalRuntime() ? DEPLOYED_APP_URL : new URL("./", window.location.href).href);

  if (flyerOnly) {
    url.searchParams.set("view", FLYER_VIEW_PARAM);
  } else {
    url.searchParams.delete("view");
  }

  url.hash = "";
  return url.toString();
}

function encodeCasePayload(data) {
  const payload = JSON.stringify({
    version: 1,
    case: serializeCaseData(data)
  });

  return btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeCasePayload(encoded) {
  const normalized = String(encoded || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalized) {
    return null;
  }

  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  try {
    const decoded = decodeURIComponent(escape(atob(`${normalized}${padding}`)));
    const payload = JSON.parse(decoded);
    return payload?.case || null;
  } catch {
    return null;
  }
}

function buildShareUrl(data = state.currentCase, { flyerOnly = Boolean(data && hasShareableCase(data)) } = {}) {
  const baseUrl = buildBaseAppUrl({ flyerOnly });

  if (!data || !hasShareableCase(data)) {
    return baseUrl;
  }

  return `${baseUrl}${SHARE_PREFIX}${encodeCasePayload(data)}`;
}

function updateHash(data) {
  if (!data || !hasShareableCase(data)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return;
  }

  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${SHARE_PREFIX}${encodeCasePayload(data)}`);
}

function readHashCase() {
  if (!window.location.hash.startsWith(SHARE_PREFIX)) {
    return null;
  }

  return decodeCasePayload(window.location.hash.slice(SHARE_PREFIX.length));
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function buildInitials(value) {
  const pieces = normalizeString(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return pieces.map((piece) => piece[0]?.toUpperCase() || "").join("") || "MP";
}

function buildFact(label, value) {
  if (!value) {
    return "";
  }

  return `
    <div class="fact-card">
      <span class="fact-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function buildActionLinks(data) {
  const links = [];

  if (data.officialUrl) {
    links.push({ label: "Official Case Page", href: data.officialUrl });
  }

  if (data.tipUrl) {
    links.push({ label: "Official Tip Form", href: data.tipUrl });
  }

  if (data.namusUrl) {
    links.push({ label: "NamUs", href: data.namusUrl });
  }

  if (data.caseType === "child" && data.ncmecUrl) {
    links.push({ label: "NCMEC", href: data.ncmecUrl });
  }

  if (data.agencyPhone) {
    const dialable = data.agencyPhone.replace(/[^\d+]/g, "");
    if (dialable) {
      links.push({ label: "Call Agency", href: `tel:${dialable}` });
    }
  }

  if (data.agencyEmail) {
    links.push({ label: "Email Agency", href: `mailto:${encodeURIComponent(data.agencyEmail)}` });
  }

  return links;
}

function renderFlags(data, sourceLabel) {
  const flags = [
    `<span class="summary-chip">${escapeHtml(sourceLabel)}</span>`,
    `<span class="summary-chip">${escapeHtml(data.caseType === "child" ? "Child case flyer" : "Public case flyer")}</span>`
  ];

  if (data.photoUrl) {
    flags.push('<span class="summary-chip">Photo included</span>');
  }

  if (buildActionLinks(data).length > 0) {
    flags.push(`<span class="summary-chip">${buildActionLinks(data).length} official link${buildActionLinks(data).length === 1 ? "" : "s"}</span>`);
  }

  previewFlags.innerHTML = flags.join("");
}

function buildPhotoMarkup(data) {
  if (!data.photoUrl) {
    return `
      <div class="poster-photo placeholder">
        <span>${escapeHtml(buildInitials(data.name || data.caseLabel || "Missing Person"))}</span>
      </div>
    `;
  }

  return `
    <div class="poster-photo has-image">
      <img src="${escapeAttribute(data.photoUrl)}" alt="${escapeAttribute(data.name || "Missing person photo")}" />
    </div>
  `;
}

function renderFlyer(data, sourceLabel) {
  state.currentCase = data;
  appStatus.textContent = isFlyerOnlyView() ? "Flyer-only view" : "Shareable flyer page ready";
  previewStatus.textContent = `${sourceLabel}. Share only public information and route tips to official contacts.`;
  renderFlags(data, sourceLabel);

  const facts = [
    buildFact("Name", data.name || data.caseLabel),
    buildFact("Nickname", data.nickname),
    buildFact("Age", data.age),
    buildFact("Case number", data.caseNumber),
    buildFact("Last seen", formatDate(data.lastSeenDate)),
    buildFact("Location", data.lastSeenLocation),
    buildFact("Agency", data.agencyName)
  ]
    .filter(Boolean)
    .join("");

  const actions = buildActionLinks(data)
    .map(
      (link) =>
        `<a class="flyer-link" href="${escapeAttribute(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`
    )
    .join("");

  flyerPreview.classList.remove("empty");
  flyerPreview.innerHTML = `
    <article class="flyer-card">
      <div class="flyer-banner">
        <span>${escapeHtml(data.caseType === "child" ? "Missing Child Support Flyer" : "Missing Person Support Flyer")}</span>
        <strong>${escapeHtml(data.caseLabel || `Help Locate ${data.name || "This Person"}`)}</strong>
      </div>

      <div class="flyer-head">
        ${buildPhotoMarkup(data)}
        <div class="flyer-identity">
          <p class="headline-eyebrow">Public case page</p>
          <h3>${escapeHtml(data.name || data.caseLabel || "Unnamed case")}</h3>
          <p class="headline-copy">
            ${escapeHtml(
              data.summary ||
                "Add a public case summary with the official facts you want shown on the flyer."
            )}
          </p>
          <div class="fact-grid">${facts}</div>
        </div>
      </div>

      <div class="flyer-body">
        ${
          data.features
            ? `<section><h4>Distinguishing features</h4><p>${formatMultiline(data.features)}</p></section>`
            : ""
        }
        ${
          data.clothing
            ? `<section><h4>Clothing or items</h4><p>${formatMultiline(data.clothing)}</p></section>`
            : ""
        }
        ${
          data.tipInstructions
            ? `<section><h4>How to share information</h4><p>${formatMultiline(data.tipInstructions)}</p></section>`
            : ""
        }
      </div>

      <div class="flyer-footer">
        <div class="contact-block">
          <h4>Official contacts</h4>
          <p>${escapeHtml(data.agencyName || "Use official law-enforcement or case contacts.")}</p>
          ${
            data.agencyPhone || data.agencyEmail
              ? `<p>${escapeHtml(
                  [data.agencyPhone, data.agencyEmail].filter(Boolean).join("  |  ")
                )}</p>`
              : '<p>Add an agency phone number, email, or official case link above.</p>'
          }
        </div>
        <div class="flyer-links">${actions || '<span class="muted-inline">No official links added yet.</span>'}</div>
      </div>

      <p class="flyer-note">
        Share tips with official contacts only. Do not publish private leads, personal account credentials,
        or non-public evidence in this flyer.
      </p>
    </article>
  `;

  const image = flyerPreview.querySelector(".poster-photo img");
  if (image) {
    image.addEventListener("error", () => {
      const parent = image.closest(".poster-photo");
      if (parent) {
        parent.classList.remove("has-image");
        parent.classList.add("placeholder");
        parent.innerHTML = `<span>${escapeHtml(buildInitials(data.name || data.caseLabel || "Missing Person"))}</span>`;
      }
    });
  }
}

function renderEmptyPreview(message = "Use the form above to build a public flyer page with a shareable link and QR code.") {
  state.currentCase = null;
  appStatus.textContent = isFlyerOnlyView() ? "Flyer-only view" : "Browser-only case builder";
  previewStatus.textContent = "Create a case or open a shared case link to preview the flyer.";
  previewFlags.innerHTML = "";
  flyerPreview.classList.add("empty");
  flyerPreview.innerHTML = `
    <div class="empty-state">
      <h3>No case loaded yet</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderChecklist() {
  checklistWrap.innerHTML = CHECKLIST_ITEMS.map((item) => {
    const checked = Boolean(state.checklist[item.id]);

    return `
      <label class="check-item">
        <input type="checkbox" data-check-id="${escapeAttribute(item.id)}" ${checked ? "checked" : ""} />
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </span>
      </label>
    `;
  }).join("");
}

function copyToClipboard(text, successMessage) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => {
      showFormWarning(successMessage);
    });
  }

  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "true");
  scratch.style.position = "absolute";
  scratch.style.left = "-9999px";
  document.body.appendChild(scratch);
  scratch.select();

  const copied = document.execCommand("copy");
  scratch.remove();

  if (!copied) {
    return Promise.reject(new Error("Clipboard copy failed"));
  }

  showFormWarning(successMessage);
  return Promise.resolve();
}

async function shareFlyer() {
  const url = buildShareUrl(state.currentCase, { flyerOnly: true });
  const title = state.currentCase?.name
    ? `Missing person flyer for ${state.currentCase.name}`
    : "Missing Person Support Kit";
  const text = state.currentCase
    ? "Public flyer link. Share only if you are authorized to publish this case information."
    : "Static case-flyer builder hosted on GitHub Pages.";

  if (navigator.share) {
    await navigator.share({ title, text, url });
    return;
  }

  await copyToClipboard(url, "Flyer link copied to the clipboard.");
}

function buildQrUrls(text) {
  return QR_PROVIDER_URLS.map((builder) => builder(text));
}

function closeQrPopup() {
  qrPopup.hidden = true;
}

function openQrPopup() {
  const url = buildShareUrl(state.currentCase, { flyerOnly: true });
  const urls = buildQrUrls(url);
  let index = 0;

  qrCaption.textContent = state.currentCase?.name
    ? `Scan to open the flyer for ${state.currentCase.name}.`
    : "Scan to open the app.";

  qrImage.onerror = () => {
    index += 1;

    if (index < urls.length) {
      qrImage.src = urls[index];
      return;
    }

    showFormWarning("QR image service failed. Use Copy Link instead.");
    closeQrPopup();
  };

  qrImage.src = urls[index];
  qrPopup.hidden = false;
}

function saveCurrentFormLocally(showMessage = true) {
  const { data, warnings } = sanitizeCaseData(readFormData());

  if (!hasShareableCase(data)) {
    showFormWarning("Add at least a case label, name, summary, official case link, or agency contact before saving.");
    return;
  }

  saveDraft(data);
  state.currentCase = data;

  if (warnings.length > 0) {
    showFormWarning(warnings.join(" "));
  } else if (showMessage) {
    showFormWarning("Draft saved on this device.");
  } else {
    hideFormWarning();
  }

  renderFlyer(data, "Local draft saved");
}

function buildFlyerFromForm() {
  const { data, warnings } = sanitizeCaseData(readFormData());

  if (!hasShareableCase(data)) {
    renderEmptyPreview("Add public case details and at least one identifying label or official contact.");
    showFormWarning("Add at least a case label, name, summary, official case link, or agency contact.");
    return;
  }

  saveDraft(data);
  updateHash(data);

  if (warnings.length > 0) {
    showFormWarning(warnings.join(" "));
  } else {
    hideFormWarning();
  }

  renderFlyer(data, "Shareable flyer ready");
}

function clearAll() {
  form.reset();
  clearDraft();
  updateHash(null);
  hideFormWarning();
  renderEmptyPreview();
}

function loadDemo() {
  writeFormData(DEMO_CASE);
  buildFlyerFromForm();
}

function setDefaultStatus() {
  appStatus.textContent = isFlyerOnlyView() ? "Flyer-only view" : "Browser-only case builder";
  sourceNote.textContent =
    "GitHub Pages can host this static app, the flyer preview, QR sharing, and the install flow for free. It does not provide a secure database, paid search APIs, or a private evidence portal.";
}

function hydrateFromHashOrDraft() {
  const sharedCase = readHashCase();

  if (sharedCase && hasShareableCase(sharedCase)) {
    const { data } = sanitizeCaseData({
      ...EMPTY_CASE,
      ...sharedCase
    });
    writeFormData(data);
    saveDraft(data);
    renderFlyer(data, "Opened from shared link");
    return;
  }

  const draft = loadDraft();
  if (draft && hasShareableCase(draft)) {
    const { data } = sanitizeCaseData({
      ...EMPTY_CASE,
      ...draft
    });
    writeFormData(data);
    renderFlyer(data, "Loaded local draft");
    return;
  }

  renderEmptyPreview();
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!state.deferredPrompt) {
      return;
    }

    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    installButton.hidden = true;
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register(new URL("../sw.js", window.location.href)).catch(() => {
    // Ignore service worker registration failures in static mode.
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  buildFlyerFromForm();
});

saveButton.addEventListener("click", () => {
  saveCurrentFormLocally();
});

clearButton.addEventListener("click", clearAll);
demoButton.addEventListener("click", loadDemo);

shareButton.addEventListener("click", () => {
  shareFlyer().catch(() => {
    showFormWarning("Unable to share from this browser. Use Copy Link from the QR popup instead.");
  });
});

qrButton.addEventListener("click", openQrPopup);
printButton.addEventListener("click", () => {
  if (!state.currentCase) {
    showFormWarning("Create a flyer before printing.");
    return;
  }

  window.print();
});

qrClose.addEventListener("click", closeQrPopup);
qrPopup.addEventListener("click", (event) => {
  if (event.target === qrPopup) {
    closeQrPopup();
  }
});

qrOpenLinkButton.addEventListener("click", () => {
  window.open(buildShareUrl(state.currentCase, { flyerOnly: true }), "_blank", "noopener,noreferrer");
});

qrCopyLinkButton.addEventListener("click", () => {
  copyToClipboard(buildShareUrl(state.currentCase, { flyerOnly: true }), "Flyer link copied to the clipboard.").catch(() => {
    showFormWarning("Unable to copy the flyer link from this browser.");
  });
});

checklistWrap.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }

  const checkId = target.dataset.checkId;
  if (!checkId) {
    return;
  }

  state.checklist[checkId] = target.checked;
  saveChecklistState();
});

window.addEventListener("hashchange", () => {
  const sharedCase = readHashCase();

  if (!sharedCase || !hasShareableCase(sharedCase)) {
    return;
  }

  const { data } = sanitizeCaseData({
    ...EMPTY_CASE,
    ...sharedCase
  });
  writeFormData(data);
  renderFlyer(data, "Opened from shared link");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeQrPopup();
  }
});

syncViewMode();
setDefaultStatus();
renderChecklist();
hydrateFromHashOrDraft();
setupInstallPrompt();
registerServiceWorker();
