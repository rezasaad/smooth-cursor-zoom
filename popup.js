'use strict';

const {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  sanitizeSiteProfile,
  renderShortcut
} = globalThis.SCZSettings;

const RANGE_KEYS = [
  'zoom', 'motionBlur', 'cursorScale', 'pageDefocus', 'brightness', 'contrast', 'vignette',
  'pixelStrength', 'pixelSize', 'rgbStrength', 'toneStrength', 'noiseStrength', 'flickerStrength',
  'areaPadding', 'areaHoldDelay', 'navigationSensitivity'
];
const SELECT_KEYS = ['vignetteCenter', 'areaMode'];
const controls = Object.fromEntries([...RANGE_KEYS, ...SELECT_KEYS].map((key) => [key, document.querySelector(`#${key}`)]));
const liveBadge = document.querySelector('#live-badge');
const liveText = liveBadge.querySelector('.live-text');
const previewStatus = document.querySelector('#preview-status');
const saveStatus = document.querySelector('#save-status');

let draft = sanitizeSettings(DEFAULT_SETTINGS);
let siteProfiles = {};
let currentSiteKey = null;
let activeTabId = null;
let previewAvailable = false;
let previewPort = null;
let updateFrame = 0;
let shortcutRecordingTarget = null;
let shortcutBeforeRecording = null;
let shortcutMouseRecordedAt = 0;

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const isMatch = panel.dataset.panel === target;
      panel.classList.toggle('active', isMatch);
      panel.hidden = !isMatch;
    });
  });
});

function renderSiteProfile() {
  const profile = sanitizeSiteProfile(currentSiteKey ? siteProfiles[currentSiteKey] : null);
  document.querySelector('#current-site').textContent = currentSiteKey || 'صفحهٔ محافظت‌شده';
  document.querySelector('#site-engine').value = profile.engine;
  document.querySelector('#site-performance').value = profile.performance;
  document.querySelector('#site-stabilize').checked = profile.stabilizePopups;
}

function outputText(key, value) {
  if (['vignette', 'pixelStrength', 'brightness', 'contrast', 'rgbStrength', 'toneStrength', 'noiseStrength', 'flickerStrength'].includes(key)) return `${value}%`;
  if (key === 'zoom' || key === 'cursorScale' || key === 'navigationSensitivity') return `${Number(value).toFixed(2)}×`;
  if (key === 'areaHoldDelay') return `${Math.round(Number(value))} ms`;
  if (key === 'areaPadding') return `${Math.round(Number(value))} px`;
  return `${Number(value).toFixed(1)} px`;
}

function renderShortcutControls() {
  renderShortcut(draft.areaShortcut, document.querySelector('#popup-area-shortcut-value'));
  renderShortcut(draft.navigationShortcut, document.querySelector('#popup-navigation-shortcut-value'));
  document.querySelector('#popup-area-shortcut').hidden = draft.areaMode === 'shared';
}

function render() {
  for (const key of RANGE_KEYS) {
    controls[key].value = String(draft[key]);
    document.querySelector(`#${key}-output`).value = outputText(key, draft[key]);
  }
  for (const key of SELECT_KEYS) controls[key].value = draft[key];
  renderShortcutControls();
}

function readDraft() {
  const next = {
    ...draft,
    shortcut: { ...draft.shortcut },
    areaShortcut: { ...draft.areaShortcut },
    navigationShortcut: { ...draft.navigationShortcut }
  };
  for (const key of RANGE_KEYS) next[key] = Number(controls[key].value);
  for (const key of SELECT_KEYS) next[key] = controls[key].value;
  draft = sanitizeSettings(next);
  for (const key of RANGE_KEYS) document.querySelector(`#${key}-output`).value = outputText(key, draft[key]);
}

function schedulePreviewUpdate() {
  if (!previewAvailable || !Number.isInteger(activeTabId)) return;
  cancelAnimationFrame(updateFrame);
  updateFrame = requestAnimationFrame(() => {
    chrome.tabs.sendMessage(activeTabId, { type: 'scz-preview-update', settings: draft }).catch(() => {
      setPreviewUnavailable('ارتباط با صفحه قطع شد. صفحه را Reload کنید.');
    });
  });
}

function setPreviewUnavailable(message) {
  previewAvailable = false;
  liveBadge.classList.add('off');
  liveText.textContent = 'OFF';
  previewStatus.textContent = message;
  previewStatus.classList.add('error');
}

function setPreviewAvailable() {
  previewAvailable = true;
  liveBadge.classList.remove('off');
  liveText.textContent = 'LIVE';
  previewStatus.textContent = 'تغییرات به‌صورت زنده روی صفحه نمایش داده می‌شوند.';
  previewStatus.classList.remove('error');
}

for (const key of RANGE_KEYS) {
  controls[key].addEventListener('input', () => {
    readDraft();
    schedulePreviewUpdate();
  });
}
for (const key of SELECT_KEYS) {
  controls[key].addEventListener('change', () => {
    readDraft();
    renderShortcutControls();
    schedulePreviewUpdate();
  });
}

for (const key of RANGE_KEYS) {
  const range = controls[key];
  const output = document.querySelector(`#${key}-output`);
  output.title = 'برای مقدار دقیق دابل‌کلیک کنید';
  output.classList.add('editable-output');
  output.addEventListener('dblclick', () => {
    if (output.hidden) return;
    const editor = document.createElement('input');
    editor.type = 'number';
    editor.className = 'numeric-editor';
    editor.min = range.min;
    editor.max = range.max;
    editor.step = range.step;
    editor.value = range.value;
    output.hidden = true;
    output.parentElement.insertBefore(editor, output);
    editor.focus();
    editor.select();
    let cancelled = false;
    const finish = () => {
      if (!cancelled && editor.value !== '') range.value = editor.value;
      output.hidden = false;
      editor.remove();
      readDraft();
      schedulePreviewUpdate();
    };
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') editor.blur();
      if (event.key === 'Escape') { cancelled = true; editor.blur(); }
    });
    editor.addEventListener('blur', finish, { once: true });
  });
}

document.querySelectorAll('.control').forEach((group) => {
  group.querySelector('.reset').addEventListener('click', () => {
    const key = group.dataset.key;
    controls[key].value = String(DEFAULT_SETTINGS[key]);
    readDraft();
    renderShortcutControls();
    schedulePreviewUpdate();
  });
});

const areaShortcutRecorder = document.querySelector('#record-area-shortcut');
const navigationShortcutRecorder = document.querySelector('#record-navigation-shortcut');

function beginPopupShortcutRecording(target) {
  if (shortcutRecordingTarget) return;
  shortcutRecordingTarget = target;
  shortcutBeforeRecording = { ...(target === 'area' ? draft.areaShortcut : draft.navigationShortcut) };
  const recorder = target === 'area' ? areaShortcutRecorder : navigationShortcutRecorder;
  recorder.classList.add('recording');
  recorder.querySelector('small').textContent = 'کلید یا دکمهٔ موس · Esc برای لغو';
}

function finishPopupShortcutRecording(target) {
  const recorder = target === 'area' ? areaShortcutRecorder : navigationShortcutRecorder;
  recorder.classList.remove('recording');
  recorder.querySelector('small').textContent = 'برای تغییر کلیک کنید';
  shortcutRecordingTarget = null;
}

areaShortcutRecorder.addEventListener('click', () => beginPopupShortcutRecording('area'));
navigationShortcutRecorder.addEventListener('click', () => beginPopupShortcutRecording('navigation'));

document.querySelector('#reset-area-shortcut').addEventListener('click', () => {
  draft.areaShortcut = { ...DEFAULT_SETTINGS.areaShortcut };
  renderShortcutControls();
  schedulePreviewUpdate();
});
document.querySelector('#reset-navigation-shortcut').addEventListener('click', () => {
  draft.navigationShortcut = { ...DEFAULT_SETTINGS.navigationShortcut };
  renderShortcutControls();
  schedulePreviewUpdate();
});

window.addEventListener('keydown', (event) => {
  if (!shortcutRecordingTarget) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const target = shortcutRecordingTarget;
  if (event.code === 'Escape') {
    if (target === 'area') draft.areaShortcut = { ...shortcutBeforeRecording };
    else draft.navigationShortcut = { ...shortcutBeforeRecording };
    finishPopupShortcutRecording(target);
    renderShortcutControls();
    return;
  }
  if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(event.code)) return;
  const recorded = {
    code: event.code,
    mouseButton: null,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
  if (target === 'area') draft.areaShortcut = recorded;
  else draft.navigationShortcut = recorded;
  finishPopupShortcutRecording(target);
  renderShortcutControls();
  schedulePreviewUpdate();
}, true);

window.addEventListener('pointerdown', (event) => {
  if (!shortcutRecordingTarget || event.button < 0 || event.button > 4) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  shortcutMouseRecordedAt = Date.now();
  const target = shortcutRecordingTarget;
  const previous = target === 'area' ? draft.areaShortcut : draft.navigationShortcut;
  const recorded = {
    code: previous.code,
    mouseButton: event.button,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
  if (target === 'area') draft.areaShortcut = recorded;
  else draft.navigationShortcut = recorded;
  finishPopupShortcutRecording(target);
  renderShortcutControls();
  schedulePreviewUpdate();
}, true);

window.addEventListener('contextmenu', (event) => {
  if (shortcutRecordingTarget || Date.now() - shortcutMouseRecordedAt < 600) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

document.querySelector('#reset-all').addEventListener('click', () => {
  const preserved = {
    mode: draft.mode,
    durationIn: draft.durationIn,
    durationOut: draft.durationOut,
    easing: draft.easing,
    shortcut: draft.shortcut,
    areaShortcut: draft.areaShortcut,
    navigationShortcut: draft.navigationShortcut
  };
  draft = sanitizeSettings({ ...DEFAULT_SETTINGS, ...preserved });
  render();
  schedulePreviewUpdate();
  saveStatus.textContent = 'مقادیر پنل به پیش‌فرض برگشت؛ برای ثبت ذخیره کنید.';
});

document.querySelector('#save-site-profile').addEventListener('click', async () => {
  if (!currentSiteKey) return;
  siteProfiles[currentSiteKey] = {
    engine: document.querySelector('#site-engine').value,
    performance: document.querySelector('#site-performance').value,
    stabilizePopups: document.querySelector('#site-stabilize').checked
  };
  await chrome.storage.sync.set({ mfzSiteProfiles: siteProfiles });
  saveStatus.textContent = `پروفایل ${currentSiteKey} ذخیره شد.`;
});

document.querySelector('#reset-site-profile').addEventListener('click', async () => {
  if (!currentSiteKey) return;
  delete siteProfiles[currentSiteKey];
  await chrome.storage.sync.set({ mfzSiteProfiles: siteProfiles });
  renderSiteProfile();
  saveStatus.textContent = `پروفایل ${currentSiteKey} حذف شد.`;
});

document.querySelector('#save').addEventListener('click', async () => {
  readDraft();
  try {
    await chrome.storage.sync.set({ mfzSettings: draft });
    saveStatus.textContent = 'تنظیمات ذخیره شد.';
  } catch (_) {
    saveStatus.textContent = 'ذخیره انجام نشد.';
  }
});

document.querySelector('#start-area-selection').addEventListener('click', async () => {
  if (!Number.isInteger(activeTabId)) {
    setPreviewUnavailable('تب فعالی برای رسم کادر پیدا نشد.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(activeTabId, { type: 'scz-area-select-start' });
    window.close();
  } catch (_) {
    setPreviewUnavailable('رسم کادر روی این صفحه مجاز نیست؛ صفحه را Reload کنید.');
  }
});

document.querySelector('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

(async () => {
  try {
    const { mfzSettings, mfzSiteProfiles } = await chrome.storage.sync.get(['mfzSettings', 'mfzSiteProfiles']);
    draft = sanitizeSettings(mfzSettings || DEFAULT_SETTINGS);
    siteProfiles = mfzSiteProfiles && typeof mfzSiteProfiles === 'object' ? mfzSiteProfiles : {};
  } catch (_) {
    draft = sanitizeSettings(DEFAULT_SETTINGS);
  }
  render();
  renderSiteProfile();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !Number.isInteger(tab.id)) {
    setPreviewUnavailable('تب فعالی برای پیش‌نمایش پیدا نشد.');
    return;
  }
  activeTabId = tab.id;
  try {
    const url = new URL(tab.url || '');
    currentSiteKey = url.hostname || null;
  } catch (_) {
    currentSiteKey = null;
  }
  renderSiteProfile();
  previewPort = chrome.runtime.connect({ name: 'scz-live-preview' });
  previewPort.postMessage({ type: 'bind-preview-tab', tabId: activeTabId });

  try {
    await chrome.tabs.sendMessage(activeTabId, { type: 'scz-preview-start', settings: draft });
    setPreviewAvailable();
  } catch (_) {
    setPreviewUnavailable('پیش‌نمایش روی این صفحه مجاز نیست؛ صفحه را یک‌بار Reload کنید.');
  }
})();
