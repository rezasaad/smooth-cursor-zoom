'use strict';

const {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  renderShortcut
} = globalThis.SCZSettings;

const form = document.querySelector('#settings-form');
const shortcutRecorder = document.querySelector('#shortcut-recorder');
const shortcutValue = document.querySelector('#shortcut-value');
const areaShortcutRecorder = document.querySelector('#area-shortcut-recorder');
const areaShortcutValue = document.querySelector('#area-shortcut-value');
const areaPadding = document.querySelector('#area-padding');
const areaPaddingOutput = document.querySelector('#area-padding-output');
const areaHoldDelay = document.querySelector('#area-hold-delay');
const areaHoldDelayOutput = document.querySelector('#area-hold-delay-output');
const areaCard = document.querySelector('#area-title').closest('.card');
const navigationShortcutRecorder = document.querySelector('#navigation-shortcut-recorder');
const navigationShortcutValue = document.querySelector('#navigation-shortcut-value');
const navigationSensitivity = document.querySelector('#navigation-sensitivity');
const navigationSensitivityOutput = document.querySelector('#navigation-sensitivity-output');
const zoomRange = document.querySelector('#zoom-range');
const zoomOutput = document.querySelector('#zoom-output');
const durationIn = document.querySelector('#duration-in');
const durationInOutput = document.querySelector('#duration-in-output');
const durationOut = document.querySelector('#duration-out');
const durationOutOutput = document.querySelector('#duration-out-output');
const motionBlur = document.querySelector('#motion-blur');
const motionBlurOutput = document.querySelector('#motion-blur-output');
const cursorScale = document.querySelector('#cursor-scale');
const cursorScaleOutput = document.querySelector('#cursor-scale-output');
const vignette = document.querySelector('#vignette');
const vignetteOutput = document.querySelector('#vignette-output');
const vignetteCenter = document.querySelector('#vignette-center');
const pixelStrength = document.querySelector('#pixel-strength');
const pixelStrengthOutput = document.querySelector('#pixel-strength-output');
const pixelSize = document.querySelector('#pixel-size');
const pixelSizeOutput = document.querySelector('#pixel-size-output');
const toneStrength = document.querySelector('#tone-strength');
const toneStrengthOutput = document.querySelector('#tone-strength-output');
const noiseStrength = document.querySelector('#noise-strength');
const noiseStrengthOutput = document.querySelector('#noise-strength-output');
const rgbStrength = document.querySelector('#rgb-strength');
const rgbStrengthOutput = document.querySelector('#rgb-strength-output');
const flickerStrength = document.querySelector('#flicker-strength');
const flickerStrengthOutput = document.querySelector('#flicker-strength-output');
const pageDefocus = document.querySelector('#page-defocus');
const pageDefocusOutput = document.querySelector('#page-defocus-output');
const brightness = document.querySelector('#brightness');
const brightnessOutput = document.querySelector('#brightness-output');
const contrast = document.querySelector('#contrast');
const contrastOutput = document.querySelector('#contrast-output');
const effectPreview = document.querySelector('#effect-preview');
const resetButton = document.querySelector('#reset-button');
const exportButton = document.querySelector('#export-button');
const importButton = document.querySelector('#import-button');
const importFile = document.querySelector('#import-file');
const clearSiteProfiles = document.querySelector('#clear-site-profiles');
const status = document.querySelector('#status');

let currentShortcut = { ...DEFAULT_SETTINGS.shortcut };
let currentAreaShortcut = { ...DEFAULT_SETTINGS.areaShortcut };
let currentNavigationShortcut = { ...DEFAULT_SETTINGS.navigationShortcut };
let shortcutBeforeRecording = null;
let recordingTarget = null;
let recording = false;
let shortcutMouseRecordedAt = 0;
let statusTimer = 0;

function setRecording(value, target = recordingTarget || 'normal') {
  recording = value;
  recordingTarget = value ? target : null;
  const recorder = target === 'area'
    ? areaShortcutRecorder
    : target === 'navigation' ? navigationShortcutRecorder : shortcutRecorder;
  recorder.classList.toggle('recording', value);
  recorder.setAttribute('aria-pressed', String(value));
  const label = recorder.querySelector('.shortcut-label');
  const hint = recorder.querySelector('.record-hint');
  if (target === 'area') {
    label.textContent = value ? 'در حال ضبط…' : 'شورتکات رسم کادر';
  } else if (target === 'navigation') {
    label.textContent = value ? 'در حال ضبط…' : 'شورتکات نویگیشن (Grab & Drag)';
  } else {
    label.textContent = value ? 'در حال ضبط…' : 'شورتکات اصلی زوم';
  }
  hint.textContent = value ? 'کلید یا دکمهٔ موس را فشار دهید · Esc برای لغو' : 'برای تغییر کلیک کنید';
}

function showStatus(message, kind = 'success') {
  window.clearTimeout(statusTimer);
  status.textContent = message;
  status.dataset.kind = kind;
  status.classList.add('visible');
  statusTimer = window.setTimeout(() => status.classList.remove('visible'), 3200);
}

function setFormValues(value) {
  const settings = sanitizeSettings(value);
  currentShortcut = { ...settings.shortcut };
  currentAreaShortcut = { ...settings.areaShortcut };
  currentNavigationShortcut = { ...settings.navigationShortcut };
  renderShortcut(currentShortcut, shortcutValue);
  renderShortcut(currentAreaShortcut, areaShortcutValue);
  renderShortcut(currentNavigationShortcut, navigationShortcutValue);

  zoomRange.value = String(settings.zoom);
  durationIn.value = String(settings.durationIn);
  durationOut.value = String(settings.durationOut);
  motionBlur.value = String(settings.motionBlur);
  cursorScale.value = String(settings.cursorScale);
  vignette.value = String(settings.vignette);
  vignetteCenter.value = settings.vignetteCenter;
  pixelStrength.value = String(settings.pixelStrength);
  pixelSize.value = String(settings.pixelSize);
  toneStrength.value = String(settings.toneStrength);
  noiseStrength.value = String(settings.noiseStrength);
  rgbStrength.value = String(settings.rgbStrength);
  flickerStrength.value = String(settings.flickerStrength);
  pageDefocus.value = String(settings.pageDefocus);
  brightness.value = String(settings.brightness);
  contrast.value = String(settings.contrast);
  areaPadding.value = String(settings.areaPadding);
  areaHoldDelay.value = String(settings.areaHoldDelay);
  navigationSensitivity.value = String(settings.navigationSensitivity);
  document.querySelector(`input[name="area-mode"][value="${settings.areaMode}"]`).checked = true;
  areaCard.dataset.areaMode = settings.areaMode;
  document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
  document.querySelector(`input[name="easing"][value="${settings.easing}"]`).checked = true;
  updateOutputs();
}

function updateEffectsPreview() {
  const size = Number(pixelSize.value);
  effectPreview.style.setProperty('--pv-vignette', String(Number(vignette.value) / 100));
  effectPreview.style.setProperty('--pv-vignette-x', vignetteCenter.value === 'focus' ? '32%' : '50%');
  effectPreview.style.setProperty('--pv-vignette-y', vignetteCenter.value === 'focus' ? '38%' : '50%');
  effectPreview.style.setProperty('--pv-defocus', `${pageDefocus.value}px`);
  effectPreview.style.setProperty('--pv-brightness', String(Number(brightness.value) / 100));
  effectPreview.style.setProperty('--pv-contrast', String(Number(contrast.value) / 100));
  effectPreview.style.setProperty('--pv-pixels', String(Number(pixelStrength.value) / 100));
  effectPreview.style.setProperty('--pv-pixel-size', `${size}px`);
  effectPreview.style.setProperty('--pv-subpixel', `${size / 3}px`);
  effectPreview.style.setProperty('--pv-subpixel-2', `${(size * 2) / 3}px`);
  effectPreview.style.setProperty('--pv-tone', String(Number(toneStrength.value) / 100));
  effectPreview.style.setProperty('--pv-noise', String(Number(noiseStrength.value) / 100));
  effectPreview.style.setProperty('--pv-rgb', String(Number(rgbStrength.value) / 100));
  effectPreview.style.setProperty('--pv-flicker', String(Number(flickerStrength.value) / 100));
}

function updateOutputs() {
  zoomOutput.value = `${Number(zoomRange.value).toFixed(2)}×`;
  durationInOutput.value = `${durationIn.value} ms`;
  durationOutOutput.value = `${durationOut.value} ms`;
  motionBlurOutput.value = `${Number(motionBlur.value).toFixed(1)} px`;
  cursorScaleOutput.value = `${Number(cursorScale.value).toFixed(2)}×`;
  pageDefocusOutput.value = `${Number(pageDefocus.value).toFixed(1)} px`;
  brightnessOutput.value = `${brightness.value}%`;
  contrastOutput.value = `${contrast.value}%`;
  vignetteOutput.value = `${vignette.value}%`;
  pixelStrengthOutput.value = `${pixelStrength.value}%`;
  pixelSizeOutput.value = `${Number(pixelSize.value).toFixed(1)} px`;
  toneStrengthOutput.value = `${toneStrength.value}%`;
  noiseStrengthOutput.value = `${noiseStrength.value}%`;
  rgbStrengthOutput.value = `${rgbStrength.value}%`;
  flickerStrengthOutput.value = `${flickerStrength.value}%`;
  areaPaddingOutput.value = `${areaPadding.value} px`;
  areaHoldDelayOutput.value = `${areaHoldDelay.value} ms`;
  navigationSensitivityOutput.value = `${Number(navigationSensitivity.value).toFixed(2)}×`;
  const selectedAreaMode = document.querySelector('input[name="area-mode"]:checked');
  if (selectedAreaMode) areaCard.dataset.areaMode = selectedAreaMode.value;
  updateEffectsPreview();
}

function valuesFromForm() {
  return sanitizeSettings({
    zoom: Number(zoomRange.value),
    mode: document.querySelector('input[name="mode"]:checked').value,
    durationIn: Number(durationIn.value),
    durationOut: Number(durationOut.value),
    easing: document.querySelector('input[name="easing"]:checked').value,
    motionBlur: Number(motionBlur.value),
    cursorScale: Number(cursorScale.value),
    vignette: Number(vignette.value),
    vignetteCenter: vignetteCenter.value,
    pixelStrength: Number(pixelStrength.value),
    pixelSize: Number(pixelSize.value),
    toneStrength: Number(toneStrength.value),
    noiseStrength: Number(noiseStrength.value),
    rgbStrength: Number(rgbStrength.value),
    flickerStrength: Number(flickerStrength.value),
    pageDefocus: Number(pageDefocus.value),
    brightness: Number(brightness.value),
    contrast: Number(contrast.value),
    areaMode: document.querySelector('input[name="area-mode"]:checked').value,
    areaPadding: Number(areaPadding.value),
    areaHoldDelay: Number(areaHoldDelay.value),
    navigationSensitivity: Number(navigationSensitivity.value),
    shortcut: currentShortcut,
    areaShortcut: currentAreaShortcut,
    navigationShortcut: currentNavigationShortcut
  });
}

shortcutRecorder.addEventListener('click', () => {
  if (recording) return;
  shortcutBeforeRecording = { ...currentShortcut };
  setRecording(true, 'normal');
});

areaShortcutRecorder.addEventListener('click', () => {
  if (recording) return;
  shortcutBeforeRecording = { ...currentAreaShortcut };
  setRecording(true, 'area');
});

navigationShortcutRecorder.addEventListener('click', () => {
  if (recording) return;
  shortcutBeforeRecording = { ...currentNavigationShortcut };
  setRecording(true, 'navigation');
});

window.addEventListener('keydown', (event) => {
  if (!recording) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const target = recordingTarget;
  const valueContainer = target === 'area'
    ? areaShortcutValue
    : target === 'navigation' ? navigationShortcutValue : shortcutValue;

  if (event.code === 'Escape') {
    if (shortcutBeforeRecording) {
      if (target === 'area') currentAreaShortcut = { ...shortcutBeforeRecording };
      else if (target === 'navigation') currentNavigationShortcut = { ...shortcutBeforeRecording };
      else currentShortcut = { ...shortcutBeforeRecording };
    }
    const restored = target === 'area'
      ? currentAreaShortcut
      : target === 'navigation' ? currentNavigationShortcut : currentShortcut;
    renderShortcut(restored, valueContainer);
    setRecording(false, target);
    showStatus('تغییر شورتکات لغو شد.', 'neutral');
    return;
  }

  const modifierCodes = new Set([
    'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
    'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'
  ]);

  if (modifierCodes.has(event.code)) {
    valueContainer.innerHTML = '<span class="press-main-key">حالا کلید اصلی را فشار دهید</span>';
    return;
  }

  const recorded = {
    code: event.code,
    mouseButton: null,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
  if (target === 'area') currentAreaShortcut = recorded;
  else if (target === 'navigation') currentNavigationShortcut = recorded;
  else currentShortcut = recorded;

  renderShortcut(recorded, valueContainer);
  setRecording(false, target);
  showStatus('شورتکات جدید ثبت شد؛ برای اعمال ذخیره کنید.', 'neutral');
}, true);

window.addEventListener('pointerdown', (event) => {
  if (!recording || event.button < 0 || event.button > 4) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  shortcutMouseRecordedAt = Date.now();
  const target = recordingTarget;
  const valueContainer = target === 'area'
    ? areaShortcutValue
    : target === 'navigation' ? navigationShortcutValue : shortcutValue;
  const current = target === 'area'
    ? currentAreaShortcut
    : target === 'navigation' ? currentNavigationShortcut : currentShortcut;
  const recorded = {
    code: current.code,
    mouseButton: event.button,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
  if (target === 'area') currentAreaShortcut = recorded;
  else if (target === 'navigation') currentNavigationShortcut = recorded;
  else currentShortcut = recorded;
  renderShortcut(recorded, valueContainer);
  setRecording(false, target);
  showStatus('دکمهٔ موس ثبت شد؛ برای اعمال، تنظیمات را ذخیره کنید.', event.button === 0 ? 'warning' : 'neutral');
}, true);

window.addEventListener('contextmenu', (event) => {
  if (recording || Date.now() - shortcutMouseRecordedAt < 600) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

[
  zoomRange, durationIn, durationOut, motionBlur, cursorScale, pageDefocus, brightness, contrast,
  vignette, pixelStrength, pixelSize, toneStrength,
  noiseStrength, rgbStrength, flickerStrength, areaPadding, areaHoldDelay,
  navigationSensitivity
].forEach((input) => input.addEventListener('input', updateOutputs));
vignetteCenter.addEventListener('change', updateOutputs);
document.querySelectorAll('input[name="area-mode"]').forEach((radio) => radio.addEventListener('change', updateOutputs));

function enablePreciseNumberEditing(range, output) {
  output.title = 'برای واردکردن مقدار دقیق، دابل‌کلیک کنید';
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
      if (!cancelled && editor.value !== '') {
        range.value = editor.value;
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
      output.hidden = false;
      editor.remove();
    };
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') editor.blur();
      if (event.key === 'Escape') {
        cancelled = true;
        editor.blur();
      }
    });
    editor.addEventListener('blur', finish, { once: true });
  });
}

[
  [zoomRange, zoomOutput], [durationIn, durationInOutput], [durationOut, durationOutOutput],
  [motionBlur, motionBlurOutput], [cursorScale, cursorScaleOutput], [pageDefocus, pageDefocusOutput],
  [brightness, brightnessOutput], [contrast, contrastOutput], [vignette, vignetteOutput],
  [pixelStrength, pixelStrengthOutput], [pixelSize, pixelSizeOutput], [toneStrength, toneStrengthOutput],
  [noiseStrength, noiseStrengthOutput], [rgbStrength, rgbStrengthOutput], [flickerStrength, flickerStrengthOutput],
  [areaPadding, areaPaddingOutput], [areaHoldDelay, areaHoldDelayOutput],
  [navigationSensitivity, navigationSensitivityOutput]
].forEach(([range, output]) => enablePreciseNumberEditing(range, output));

function createResetButton(label, reset) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reset-control';
  button.title = `بازگشت «${label}» به مقدار پیش‌فرض`;
  button.setAttribute('aria-label', button.title);
  button.textContent = '↺';
  button.addEventListener('click', () => {
    reset();
    updateOutputs();
    showStatus(`«${label}» به پیش‌فرض برگشت؛ برای ثبت ذخیره کنید.`, 'neutral');
  });
  return button;
}

function decorateControlReset(control, key, label) {
  const button = createResetButton(label, () => { control.value = String(DEFAULT_SETTINGS[key]); });
  const group = control.closest('.control-group, .select-setting-control');
  const labelRow = group && group.querySelector('.control-label');
  if (labelRow) {
    let actions = labelRow.querySelector('.value-actions');
    if (!actions) {
      actions = document.createElement('span');
      actions.className = 'value-actions';
      const output = labelRow.querySelector('output');
      if (output) actions.append(output);
      labelRow.append(actions);
    }
    actions.append(button);
    return;
  }
  if (group) {
    let row = group.querySelector('.select-label-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'select-label-row';
      const textLabel = group.querySelector('label');
      if (textLabel) row.append(textLabel);
      group.prepend(row);
    }
    row.append(button);
  }
}

[
  [zoomRange, 'zoom', 'مقدار زوم'],
  [durationIn, 'durationIn', 'مدت زوم‌این'],
  [durationOut, 'durationOut', 'مدت برگشت'],
  [motionBlur, 'motionBlur', 'Motion Blur'],
  [cursorScale, 'cursorScale', 'بزرگ‌نمایی کرسر'],
  [pageDefocus, 'pageDefocus', 'دی‌فوکوس صفحه'],
  [brightness, 'brightness', 'روشنایی'],
  [contrast, 'contrast', 'کنتراست'],
  [vignette, 'vignette', 'وینیت'],
  [pixelStrength, 'pixelStrength', 'ساب‌پیکسل RGB'],
  [pixelSize, 'pixelSize', 'اندازهٔ پیکسل'],
  [toneStrength, 'toneStrength', 'رنگ سینمایی'],
  [noiseStrength, 'noiseStrength', 'نویز و گرین'],
  [rgbStrength, 'rgbStrength', 'ماسک RGB'],
  [flickerStrength, 'flickerStrength', 'فلیکر CRT'],
  [vignetteCenter, 'vignetteCenter', 'مرکز وینیت'],
  [areaPadding, 'areaPadding', 'پدینگ کادر'],
  [areaHoldDelay, 'areaHoldDelay', 'زمان تشخیص Hold'],
  [navigationSensitivity, 'navigationSensitivity', 'حساسیت نویگیشن']
].forEach(([control, key, label]) => decorateControlReset(control, key, label));

const easingReset = createResetButton('منحنی حرکت', () => {
  document.querySelector(`input[name="easing"][value="${DEFAULT_SETTINGS.easing}"]`).checked = true;
});
easingReset.classList.add('fieldset-reset');
document.querySelector('.easing-fieldset').append(easingReset);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (recording) setRecording(false);

  try {
    await chrome.storage.sync.set({ mfzSettings: valuesFromForm() });
    showStatus('تنظیمات ذخیره شد.');
  } catch (_) {
    showStatus('ذخیره انجام نشد. دوباره تلاش کنید.', 'error');
  }
});

resetButton.addEventListener('click', async () => {
  setRecording(false);
  setFormValues(DEFAULT_SETTINGS);
  try {
    await chrome.storage.sync.set({ mfzSettings: DEFAULT_SETTINGS });
    showStatus('تنظیمات پیش‌فرض بازیابی و ذخیره شد.', 'neutral');
  } catch (_) {
    showStatus('بازنشانی انجام نشد.', 'error');
  }
});

exportButton.addEventListener('click', async () => {
  const { mfzSiteProfiles } = await chrome.storage.sync.get('mfzSiteProfiles');
  const payload = {
    format: 'smooth-cursor-zoom-settings',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: valuesFromForm(),
    siteProfiles: mfzSiteProfiles || {}
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smooth-cursor-zoom-settings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus('فایل تنظیمات ساخته شد.', 'neutral');
});

clearSiteProfiles.addEventListener('click', async () => {
  await chrome.storage.sync.set({ mfzSiteProfiles: {} });
  showStatus('تمام پروفایل‌های سایت حذف شدند.', 'neutral');
});

importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const source = parsed && parsed.settings ? parsed.settings : parsed;
    if (!source || typeof source !== 'object' || (!('zoom' in source) && !('shortcut' in source))) {
      throw new Error('Invalid settings file');
    }
    const imported = sanitizeSettings(source);
    setFormValues(imported);
    const importedProfiles = parsed && parsed.siteProfiles && typeof parsed.siteProfiles === 'object'
      ? parsed.siteProfiles : undefined;
    const storageUpdate = { mfzSettings: imported };
    if (importedProfiles) storageUpdate.mfzSiteProfiles = importedProfiles;
    await chrome.storage.sync.set(storageUpdate);
    showStatus('تنظیمات با موفقیت وارد شدند.');
  } catch (_) {
    showStatus('فایل تنظیمات معتبر نیست.', 'error');
  } finally {
    importFile.value = '';
  }
});

(async () => {
  try {
    const { mfzSettings } = await chrome.storage.sync.get('mfzSettings');
    setFormValues(mfzSettings || DEFAULT_SETTINGS);
  } catch (_) {
    setFormValues(DEFAULT_SETTINGS);
    showStatus('خواندن تنظیمات ممکن نبود؛ مقادیر پیش‌فرض نمایش داده شد.', 'error');
  }
})();
