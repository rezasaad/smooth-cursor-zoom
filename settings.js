(() => {
  'use strict';

  const DEFAULT_SITE_PROFILE = Object.freeze({
    engine: 'auto',
    performance: 'auto',
    stabilizePopups: true
  });

  const EASINGS = Object.freeze({
    smooth: 'cubic-bezier(0.65, 0, 0.35, 1)',
    balanced: 'cubic-bezier(0.45, 0, 0.55, 1)',
    snappy: 'cubic-bezier(0.76, 0, 0.24, 1)'
  });

  const DEFAULT_SETTINGS = Object.freeze({
    zoom: 2,
    mode: 'hold',
    durationIn: 380,
    durationOut: 320,
    easing: 'smooth',
    motionBlur: 4,
    vignette: 38,
    vignetteCenter: 'viewport',
    pixelStrength: 20,
    pixelSize: 4,
    toneStrength: 24,
    noiseStrength: 10,
    rgbStrength: 16,
    flickerStrength: 10,
    pageDefocus: 0,
    brightness: 100,
    contrast: 100,
    cursorScale: 2,
    areaMode: 'separate',
    areaPadding: 32,
    areaHoldDelay: 280,
    navigationSensitivity: 1,
    shortcut: Object.freeze({
      code: 'KeyZ',
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
      mouseButton: null
    }),
    areaShortcut: Object.freeze({
      code: 'KeyX',
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
      mouseButton: null
    }),
    navigationShortcut: Object.freeze({
      code: 'KeyN',
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
      mouseButton: null
    })
  });

  function clamp(number, min, max, fallback) {
    const value = Number(number);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  function normalizeShortcut(source, fallback) {
    const src = source && typeof source === 'object' ? source : fallback;
    const mouseButton = Number.isInteger(src.mouseButton) && src.mouseButton >= 0 && src.mouseButton <= 4
      ? src.mouseButton : null;
    return {
      code: typeof src.code === 'string' && src.code ? src.code : fallback.code,
      mouseButton,
      ctrl: Boolean(src.ctrl),
      alt: Boolean(src.alt),
      shift: Boolean(src.shift),
      meta: Boolean(src.meta)
    };
  }

  function sanitizeSettings(value) {
    const candidate = value && typeof value === 'object' ? value : {};
    const legacyType = typeof candidate.effectType === 'string' ? candidate.effectType : null;
    const legacyStrength = clamp(candidate.effectStrength, 0, 100, DEFAULT_SETTINGS.toneStrength);
    const fallbackFor = (key, normal, legacyTypes) => {
      if (Number.isFinite(Number(candidate[key]))) return normal;
      if (!legacyType) return normal;
      return legacyTypes.includes(legacyType) ? legacyStrength : 0;
    };

    return {
      zoom: clamp(candidate.zoom, 1.1, 6, DEFAULT_SETTINGS.zoom),
      mode: candidate.mode === 'toggle' ? 'toggle' : 'hold',
      durationIn: Math.round(clamp(candidate.durationIn, 120, 1000, DEFAULT_SETTINGS.durationIn)),
      durationOut: Math.round(clamp(candidate.durationOut, 120, 1000, DEFAULT_SETTINGS.durationOut)),
      easing: Object.prototype.hasOwnProperty.call(EASINGS, candidate.easing)
        ? candidate.easing
        : DEFAULT_SETTINGS.easing,
      motionBlur: clamp(candidate.motionBlur, 0, 16, DEFAULT_SETTINGS.motionBlur),
      vignette: clamp(candidate.vignette, 0, 100, DEFAULT_SETTINGS.vignette),
      vignetteCenter: candidate.vignetteCenter === 'focus' ? 'focus' : 'viewport',
      pixelStrength: clamp(candidate.pixelStrength, 0, 100, DEFAULT_SETTINGS.pixelStrength),
      pixelSize: clamp(candidate.pixelSize, 2, 10, DEFAULT_SETTINGS.pixelSize),
      toneStrength: clamp(candidate.toneStrength, 0, 100, fallbackFor('toneStrength', DEFAULT_SETTINGS.toneStrength, ['cinema', 'retro', 'combo'])),
      noiseStrength: clamp(candidate.noiseStrength, 0, 100, fallbackFor('noiseStrength', DEFAULT_SETTINGS.noiseStrength, ['retro', 'combo'])),
      rgbStrength: clamp(candidate.rgbStrength, 0, 100, fallbackFor('rgbStrength', DEFAULT_SETTINGS.rgbStrength, ['crt', 'combo'])),
      flickerStrength: clamp(candidate.flickerStrength, 0, 100, fallbackFor('flickerStrength', DEFAULT_SETTINGS.flickerStrength, ['crt', 'retro', 'combo'])),
      pageDefocus: clamp(candidate.pageDefocus, 0, 14, DEFAULT_SETTINGS.pageDefocus),
      brightness: clamp(candidate.brightness, 40, 180, DEFAULT_SETTINGS.brightness),
      contrast: clamp(candidate.contrast, 40, 220, DEFAULT_SETTINGS.contrast),
      cursorScale: clamp(candidate.cursorScale, 1, 4, DEFAULT_SETTINGS.cursorScale),
      areaMode: candidate.areaMode === 'shared' ? 'shared' : 'separate',
      areaPadding: Math.round(clamp(candidate.areaPadding, 0, 240, DEFAULT_SETTINGS.areaPadding)),
      areaHoldDelay: Math.round(clamp(candidate.areaHoldDelay, 150, 900, DEFAULT_SETTINGS.areaHoldDelay)),
      navigationSensitivity: clamp(candidate.navigationSensitivity, 0.2, 2, DEFAULT_SETTINGS.navigationSensitivity),
      shortcut: normalizeShortcut(candidate.shortcut, DEFAULT_SETTINGS.shortcut),
      areaShortcut: normalizeShortcut(candidate.areaShortcut, DEFAULT_SETTINGS.areaShortcut),
      navigationShortcut: normalizeShortcut(candidate.navigationShortcut, DEFAULT_SETTINGS.navigationShortcut)
    };
  }

  function sanitizeSiteProfile(value) {
    const candidate = value && typeof value === 'object' ? value : {};
    return {
      engine: ['auto', 'document', 'body'].includes(candidate.engine) ? candidate.engine : 'auto',
      performance: ['auto', 'quality', 'performance'].includes(candidate.performance) ? candidate.performance : 'auto',
      stabilizePopups: candidate.stabilizePopups !== false
    };
  }

  const KEY_NAMES = Object.freeze({
    Space: 'Space',
    Enter: 'Enter',
    NumpadEnter: 'Num Enter',
    Tab: 'Tab',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Minus: '−',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Comma: ',',
    Period: '.',
    Slash: '/',
    NumpadAdd: 'Num +',
    NumpadSubtract: 'Num −',
    NumpadMultiply: 'Num ×',
    NumpadDivide: 'Num ÷',
    NumpadDecimal: 'Num .'
  });

  const MOUSE_NAMES = Object.freeze([
    'Mouse Left',
    'Mouse Middle',
    'Mouse Right',
    'Mouse Back',
    'Mouse Forward'
  ]);

  function keyName(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
    if (/^F([1-9]|1[0-2])$/.test(code)) return code;
    return KEY_NAMES[code] || String(code || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  function shortcutParts(shortcut) {
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.meta) parts.push('Meta');
    if (Number.isInteger(shortcut.mouseButton)) {
      parts.push(MOUSE_NAMES[shortcut.mouseButton] || `Mouse ${shortcut.mouseButton}`);
    } else {
      parts.push(keyName(shortcut.code));
    }
    return parts;
  }

  function renderShortcut(shortcut, container) {
    if (!container) return;
    container.replaceChildren();
    shortcutParts(shortcut).forEach((part, index, all) => {
      const key = document.createElement('kbd');
      key.textContent = part;
      container.append(key);
      if (index < all.length - 1) {
        const plus = document.createElement('span');
        plus.className = 'plus';
        plus.textContent = '+';
        container.append(plus);
      }
    });
  }

  globalThis.SCZSettings = Object.freeze({
    DEFAULT_SETTINGS,
    DEFAULT_SITE_PROFILE,
    EASINGS,
    clamp,
    sanitizeSettings,
    sanitizeSiteProfile,
    keyName,
    shortcutParts,
    renderShortcut
  });
})();
