(() => {
  'use strict';

  if (window.top !== window) return;

  const {
    DEFAULT_SETTINGS,
    DEFAULT_SITE_PROFILE,
    EASINGS,
    sanitizeSettings,
    sanitizeSiteProfile
  } = globalThis.SCZSettings;

  const MANAGED_STYLES = [
    'scale',
    'translate',
    'filter',
    'transform-origin',
    'transition',
    'will-change',
    'overflow-anchor'
  ];

  let settings = sanitizeSettings(DEFAULT_SETTINGS);
  let storedSettings = settings;
  let siteProfiles = {};
  let siteProfile = { ...DEFAULT_SITE_PROFILE };
  let managedZoomElement = null;
  let previewActive = false;
  let active = false;
  let held = false;
  let animationToken = 0;
  let cleanupTimer = 0;
  let settleTimer = 0;
  let effectsHideTimer = 0;
  let restoreCursorTimer = 0;
  let cursorMoveFrame = 0;
  let complexSiteCache = { value: null, checkedAt: 0 };
  let blurAnimation = null;
  let savedInlineStyles = null;
  let basePageFilter = 'none';
  let root = document.documentElement;
  let effectsHost = null;
  let effectsFrame = null;
  let effectsMotionBlurPlane = null;
  let effectsCursorAnchor = null;
  let effectsCursorScale = null;
  let effectsNavigationLock = null;
  let effectsSmartHighlight = null;
  let effectsUseTopLayer = false;
  let hiddenCursorElement = null;
  let hiddenCursorInline = null;
  let customCursorActive = false;
  let lastPointerTarget = document.documentElement;
  let selectionHost = null;
  let selectionBackdropSheet = null;
  let selectionBackdropStyle = null;
  let selectionSurface = null;
  let selectionBox = null;
  let selectionUseTopLayer = false;
  let selectionActive = false;
  let selectionDrawing = false;
  let selectionStartPoint = null;
  let selectionFinishTimer = 0;
  let smartSelectionActive = false;
  let smartSelectionConfirming = false;
  let smartSelectionTarget = null;
  let smartLastRawTarget = null;
  let smartSelectionCandidates = [];
  let smartSelectionIndex = 0;
  let smartHighlightFrame = 0;
  let smartTriggerMouseButton = null;
  let areaZoomLatched = false;
  let sharedHoldTimer = 0;
  let sharedShortcutDown = false;
  let sharedHoldTriggered = false;
  let sharedDismissedOnDown = false;
  let lastAreaToggleAt = 0;
  let navigationActive = false;
  let navigationHeld = false;
  let navigationDragging = false;
  let navigationSuppressPointerUp = false;
  let navigationSuppressClick = false;
  let navigationDragPointerId = null;
  let navigationLastDragPoint = null;
  let navigationCurrentTranslate = { x: 0, y: 0 };
  let navigationTargetTranslate = { x: 0, y: 0 };
  let navigationAnimationFrame = 0;
  let navigationHadCustomCursor = false;
  let navigationPreviousCursorType = 'arrow';
  let navigationTransitionTimer = 0;
  let cursorMorphToken = 0;
  let floatingObserver = null;
  let floatingScanFrame = 0;
  const floatingCandidates = new Set();
  const stabilizedElements = new Map();
  let lockedClientPoint = {
    x: Math.max(0, window.innerWidth / 2),
    y: Math.max(0, window.innerHeight / 2)
  };
  let zoomTransformOriginClient = { ...lockedClientPoint };
  let zoomTranslation = { x: 0, y: 0 };
  let lastPointer = {
    clientX: lockedClientPoint.x,
    clientY: lockedClientPoint.y,
    cursorType: 'arrow'
  };

  function getRoot() {
    if (!root || !root.isConnected) root = document.documentElement;
    return root;
  }

  function isComplexSite() {
    const now = performance.now();
    if (complexSiteCache.value !== null && now - complexSiteCache.checkedAt < 4000) {
      return complexSiteCache.value;
    }
    const hostname = location.hostname.toLowerCase();
    let result = hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com')
      || hostname === 'arena.ai' || hostname.endsWith('.arena.ai');
    if (!result) {
      result = document.getElementsByTagName('*').length > 2200;
    }
    complexSiteCache = { value: result, checkedAt: now };
    return result;
  }

  function usePerformanceProfile() {
    return siteProfile.performance === 'performance'
      || (siteProfile.performance === 'auto' && isComplexSite());
  }

  function getZoomElement() {
    if (managedZoomElement && managedZoomElement.isConnected) return managedZoomElement;
    const engine = siteProfile.engine === 'auto'
      ? (isComplexSite() ? 'body' : 'document')
      : siteProfile.engine;
    if (engine === 'body' && document.body) return document.body;
    return getRoot();
  }

  function rememberInlineStyles(element) {
    if (savedInlineStyles) return;
    managedZoomElement = element;
    savedInlineStyles = {};
    basePageFilter = getComputedStyle(element).filter || 'none';
    for (const property of MANAGED_STYLES) {
      savedInlineStyles[property] = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      };
    }
  }

  function restoreManagedProperty(element, property) {
    if (!savedInlineStyles || !savedInlineStyles[property]) return;
    const saved = savedInlineStyles[property];
    if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
    else element.style.removeProperty(property);
  }

  function restoreInlineStyles() {
    const element = managedZoomElement || getZoomElement();
    if (!element || !savedInlineStyles) return;

    for (const property of MANAGED_STYLES) {
      restoreManagedProperty(element, property);
    }

    element.removeAttribute('data-scz-zoomed');
    savedInlineStyles = null;
    managedZoomElement = null;
  }

  function currentScale(element) {
    const computed = getComputedStyle(element).scale;
    return computed && computed !== 'none' ? computed : '1';
  }

  function currentTranslate(element) {
    const computed = getComputedStyle(element).translate;
    return computed && computed !== 'none' ? computed : '0px 0px';
  }

  function numericTranslate(element) {
    const value = currentTranslate(element).split(/\s+/).map((part) => Number.parseFloat(part));
    return { x: Number.isFinite(value[0]) ? value[0] : 0, y: Number.isFinite(value[1]) ? value[1] : 0 };
  }

  function setImportant(element, property, value) {
    element.style.setProperty(property, value, 'important');
  }

  function stopMotionBlur() {
    if (blurAnimation && typeof blurAnimation.cancel === 'function') {
      try { blurAnimation.cancel(); } catch (_) {}
    }
    blurAnimation = null;
  }

  function startMotionBlur(_element, duration, overrideAmount = null) {
    const amount = overrideAmount === null ? settings.motionBlur : overrideAmount;
    stopMotionBlur();
    if (amount <= 0 || usePerformanceProfile()) return;
    ensureEffectsOverlay();
    if (!effectsHost || !effectsMotionBlurPlane || typeof effectsMotionBlurPlane.animate !== 'function') return;
    openEffectsHost();
    effectsHost.style.setProperty('--transition-blur', `${amount}px`);
    try {
      blurAnimation = effectsMotionBlurPlane.animate([
        { opacity: 0, offset: 0, easing: 'cubic-bezier(.55,0,1,.45)' },
        { opacity: .92, offset: .44, easing: 'cubic-bezier(0,.55,.45,1)' },
        { opacity: 0, offset: 1 }
      ], { duration, iterations: 1, fill: 'none' });
      const animation = blurAnimation;
      animation.finished.then(() => {
        if (blurAnimation === animation) blurAnimation = null;
        if (active) applyPersistentPageDefocus();
      }).catch(() => {});
    } catch (_) {
      blurAnimation = null;
    }
  }

  function composedPageFilter(extraBlur = 0) {
    const parts = [];
    if (basePageFilter && basePageFilter !== 'none') parts.push(basePageFilter);
    const totalBlur = Math.max(0, settings.pageDefocus + extraBlur);
    if (totalBlur > 0) parts.push(`blur(${totalBlur}px)`);
    if (settings.brightness !== 100) parts.push(`brightness(${settings.brightness}%)`);
    if (settings.contrast !== 100) parts.push(`contrast(${settings.contrast}%)`);
    return parts.length ? parts.join(' ') : 'none';
  }

  function applyPersistentPageDefocus() {
    const element = getZoomElement();
    if (!element || !savedInlineStyles) return;
    const filter = composedPageFilter(0);
    if (!active || filter === 'none') {
      restoreManagedProperty(element, 'filter');
      return;
    }
    setImportant(element, 'filter', filter);
  }

  function settleZoomedText(token, duration) {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (token !== animationToken || !active) return;
      const element = getZoomElement();
      if (!element) return;

      // Keeping will-change active can make Chrome retain a low-resolution
      // compositor texture. Releasing it at the endpoint asks Chrome to paint
      // the final scaled text again as soon as possible.
      setImportant(element, 'transition', 'none');
      restoreManagedProperty(element, 'will-change');
      applyPersistentPageDefocus();
      requestAnimationFrame(() => {
        if (token === animationToken && active) getComputedStyle(element).scale;
      });
    }, duration + 34);
  }

  function beginScaleTransition(targetScale, duration, origin, shouldCleanup, targetTranslate = { x: 0, y: 0 }) {
    const element = getZoomElement();
    if (!element) return;

    window.clearTimeout(cleanupTimer);
    window.clearTimeout(settleTimer);
    const token = ++animationToken;
    rememberInlineStyles(element);
    restoreManagedProperty(element, 'filter');

    const visibleScale = currentScale(element);
    const visibleTranslate = currentTranslate(element);
    setImportant(element, 'transition', 'none');
    setImportant(element, 'scale', visibleScale);
    setImportant(element, 'translate', visibleTranslate);
    setImportant(element, 'will-change', 'scale, translate');
    setImportant(element, 'overflow-anchor', 'none');

    if (origin) {
      setImportant(element, 'transform-origin', `${origin.x}px ${origin.y}px`);
    }

    startMotionBlur(element, duration);

    requestAnimationFrame(() => {
      if (token !== animationToken) return;
      setImportant(
        element,
        'transition',
        `scale ${duration}ms ${EASINGS[settings.easing] || EASINGS.smooth}, translate ${duration}ms ${EASINGS[settings.easing] || EASINGS.smooth}`
      );

      requestAnimationFrame(() => {
        if (token !== animationToken) return;
        setImportant(element, 'scale', String(targetScale));
        setImportant(element, 'translate', `${targetTranslate.x}px ${targetTranslate.y}px`);

        if (shouldCleanup) {
          cleanupTimer = window.setTimeout(() => {
            if (token !== animationToken || active) return;
            stopMotionBlur();
            restoreInlineStyles();
          }, duration + 100);
        } else {
          settleZoomedText(token, duration);
        }
      });
    });
  }

  function ensureTransparentSelectionBackdrop() {
    if (selectionBackdropSheet || selectionBackdropStyle) return;
    const css = 'dialog[data-scz-selector]::backdrop{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
    try {
      selectionBackdropSheet = new CSSStyleSheet();
      selectionBackdropSheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, selectionBackdropSheet];
    } catch (_) {
      selectionBackdropSheet = null;
      selectionBackdropStyle = document.createElement('style');
      selectionBackdropStyle.textContent = css;
      getRoot().append(selectionBackdropStyle);
    }
  }

  function ensureSelectionOverlay() {
    if (selectionHost && selectionHost.isConnected) return;
    ensureTransparentSelectionBackdrop();
    const element = getRoot();
    if (!element) return;

    selectionHost = document.createElement('dialog');
    selectionHost.setAttribute('data-scz-selector', 'true');
    selectionUseTopLayer = typeof selectionHost.showModal === 'function';

    const styles = {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      maxWidth: 'none', maxHeight: 'none',
      margin: '0', padding: '0', border: '0', overflow: 'hidden',
      background: 'transparent', pointerEvents: 'auto', cursor: 'crosshair',
      touchAction: 'none', userSelect: 'none', zIndex: '2147483647'
    };
    for (const [property, value] of Object.entries(styles)) {
      selectionHost.style.setProperty(property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`), value, 'important');
    }
    if (!selectionUseTopLayer) selectionHost.style.setProperty('display', 'none', 'important');

    const shadowMount = document.createElement('smooth-cursor-zoom-selector-ui');
    shadowMount.style.setProperty('position', 'absolute', 'important');
    shadowMount.style.setProperty('inset', '0', 'important');
    shadowMount.style.setProperty('display', 'block', 'important');
    selectionHost.append(shadowMount);
    const shadow = shadowMount.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .surface {
          position: absolute; inset: 0; overflow: hidden; cursor: crosshair;
          background: transparent; user-select: none; touch-action: none;
          animation: selector-in 160ms ease-out both;
        }
        .surface::before {
          position: absolute; left: var(--selector-x, 50%); top: var(--selector-y, 50%);
          z-index: 8; width: 72px; height: 72px; padding: 3px;
          border-radius: 50%; content: ""; pointer-events: none;
          transform: translate(-50%, -50%);
          background: linear-gradient(110deg, #74e0ba, #ffffff, #7da8ff, #d77cff, #74e0ba);
          background-size: 320% 100%;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          filter: drop-shadow(0 0 10px rgba(116,224,186,.56));
          animation: cursor-halo-flow 3.2s linear infinite, cursor-halo-breathe 1.8s ease-in-out infinite;
        }
        .surface::after {
          position: absolute; left: var(--selector-x, 50%); top: var(--selector-y, 50%);
          z-index: 7; width: 118px; height: 118px; border-radius: 50%;
          content: ""; pointer-events: none; transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(255,255,255,.08) 0, rgba(116,224,186,.08) 28%, rgba(125,168,255,.05) 48%, transparent 72%);
          animation: cursor-halo-soft-pulse 2.2s ease-in-out infinite;
        }
        .box {
          position: absolute; display: none; z-index: 3; min-width: 2px; min-height: 2px;
          border: 1px solid rgba(255,255,255,.88); border-radius: 7px;
          background: linear-gradient(135deg, rgba(116,224,186,.075), rgba(104,151,255,.045));
          box-shadow: 0 0 0 1px rgba(116,224,186,.72), 0 0 34px rgba(116,224,186,.34), inset 0 0 18px rgba(116,224,186,.055);
          will-change: left, top, width, height;
          animation: selection-breathe 1.8s ease-in-out infinite;
        }
        .box.visible { display: block; }
        .box::before {
          position: absolute; inset: -3px; padding: 2px; border-radius: 10px; content: ""; pointer-events: none;
          background: linear-gradient(110deg, #74e0ba, rgba(255,255,255,.95), #7da8ff, #74e0ba);
          background-size: 240% 100%;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: selection-border-flow 2.4s linear infinite;
        }
        .box::after {
          position: absolute; inset: 0; border-radius: 7px; content: ""; pointer-events: none;
          background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.12) 48%, transparent 66%);
          background-size: 220% 100%; animation: selection-sheen 2.8s ease-in-out infinite;
        }
        .corner { position: absolute; width: 18px; height: 18px; pointer-events: none; }
        .corner.tl { top: -4px; left: -4px; border-top: 3px solid #74e0ba; border-left: 3px solid #74e0ba; border-radius: 6px 0 0; }
        .corner.tr { top: -4px; right: -4px; border-top: 3px solid #74e0ba; border-right: 3px solid #74e0ba; border-radius: 0 6px 0 0; }
        .corner.bl { bottom: -4px; left: -4px; border-bottom: 3px solid #74e0ba; border-left: 3px solid #74e0ba; border-radius: 0 0 0 6px; }
        .corner.br { bottom: -4px; right: -4px; border-bottom: 3px solid #74e0ba; border-right: 3px solid #74e0ba; border-radius: 0 0 6px; }
        .box.complete { animation: complete 190ms cubic-bezier(.2,.9,.3,1) both; }
        @keyframes selector-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cursor-halo-flow { to { background-position: 320% 0; } }
        @keyframes cursor-halo-breathe { 50% { opacity: .7; filter: drop-shadow(0 0 16px rgba(125,168,255,.68)); } }
        @keyframes cursor-halo-soft-pulse { 50% { transform: translate(-50%, -50%) scale(1.12); opacity: .72; } }
        @keyframes selection-border-flow { to { background-position: 240% 0; } }
        @keyframes selection-sheen { 0%,35% { background-position: 160% 0; opacity: 0; } 58% { opacity: 1; } 100% { background-position: -80% 0; opacity: 0; } }
        @keyframes selection-breathe { 50% { box-shadow: 0 0 0 1px rgba(116,224,186,.95), 0 0 42px rgba(116,224,186,.45), inset 0 0 22px rgba(116,224,186,.08); } }
        @keyframes complete { 50% { transform: scale(1.006); border-color: #fff; box-shadow: 0 0 52px rgba(116,224,186,.78); } }
      </style>
      <div class="surface">
        <div class="box"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i></div>
      </div>`;

    selectionSurface = shadow.querySelector('.surface');
    selectionBox = shadow.querySelector('.box');
    selectionHost.addEventListener('cancel', (event) => {
      event.preventDefault();
      cancelAreaSelection();
    });

    const blockEvent = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    ['click', 'dblclick', 'contextmenu', 'dragstart', 'selectstart', 'auxclick'].forEach((type) => {
      selectionSurface.addEventListener(type, blockEvent, true);
    });

    selectionSurface.addEventListener('pointerdown', (event) => {
      blockEvent(event);
      updateSelectionHalo(event.clientX, event.clientY);
      if (!selectionActive || event.button !== 0) return;
      selectionDrawing = true;
      selectionStartPoint = { x: event.clientX, y: event.clientY };
      selectionSurface.setPointerCapture(event.pointerId);
      selectionSurface.classList.add('drawing');
      selectionBox.classList.remove('complete');
      selectionBox.classList.add('visible');
      updateSelectionBox(event.clientX, event.clientY);
    }, true);

    selectionSurface.addEventListener('pointermove', (event) => {
      blockEvent(event);
      updateSelectionHalo(event.clientX, event.clientY);
      if (!selectionDrawing || !selectionStartPoint) return;
      updateSelectionBox(event.clientX, event.clientY);
    }, true);

    selectionSurface.addEventListener('pointerup', (event) => {
      blockEvent(event);
      if (!selectionDrawing || !selectionStartPoint) return;
      selectionDrawing = false;
      selectionSurface.classList.remove('drawing');
      try { selectionSurface.releasePointerCapture(event.pointerId); } catch (_) {}
      const rect = selectionRect(selectionStartPoint, { x: event.clientX, y: event.clientY });
      selectionStartPoint = null;
      if (rect.width < 2 || rect.height < 2) {
        selectionBox.classList.remove('visible');
        return;
      }
      selectionBox.classList.add('complete');
      window.clearTimeout(selectionFinishTimer);
      selectionFinishTimer = window.setTimeout(() => {
        if (!selectionActive) return;
        closeSelectionOverlay();
        applyAreaZoom(rect);
      }, 170);
    }, true);

    selectionSurface.addEventListener('pointercancel', (event) => {
      blockEvent(event);
      selectionDrawing = false;
      selectionStartPoint = null;
      selectionSurface.classList.remove('drawing');
      selectionBox.classList.remove('visible');
    }, true);

    element.append(selectionHost);
  }

  function selectionRect(a, b) {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    return { left, top, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }

  function updateSelectionHalo(x, y) {
    if (!selectionSurface) return;
    selectionSurface.style.setProperty('--selector-x', `${x}px`);
    selectionSurface.style.setProperty('--selector-y', `${y}px`);
  }

  function updateSelectionBox(x, y) {
    if (!selectionBox || !selectionStartPoint) return;
    const rect = selectionRect(selectionStartPoint, { x, y });
    selectionBox.style.left = `${rect.left}px`;
    selectionBox.style.top = `${rect.top}px`;
    selectionBox.style.width = `${rect.width}px`;
    selectionBox.style.height = `${rect.height}px`;
  }

  function openSelectionOverlay() {
    ensureSelectionOverlay();
    if (!selectionHost) return false;
    updateSelectionHalo(lastPointer.clientX, lastPointer.clientY);
    try {
      if (selectionUseTopLayer) {
        if (!selectionHost.open) selectionHost.showModal();
      } else {
        selectionHost.style.setProperty('display', 'block', 'important');
        selectionHost.setAttribute('open', '');
      }
    } catch (_) {
      selectionHost.style.setProperty('display', 'block', 'important');
      selectionHost.setAttribute('open', '');
    }
    return true;
  }

  function closeSelectionOverlay() {
    selectionActive = false;
    selectionDrawing = false;
    selectionStartPoint = null;
    if (selectionSurface) selectionSurface.classList.remove('drawing');
    if (selectionBox) selectionBox.classList.remove('visible', 'complete');
    try {
      if (selectionUseTopLayer && selectionHost && selectionHost.open) selectionHost.close();
      else if (selectionHost && !selectionUseTopLayer) {
        selectionHost.removeAttribute('open');
        selectionHost.style.setProperty('display', 'none', 'important');
      }
    } catch (_) {}
  }

  function cancelAreaSelection() {
    window.clearTimeout(selectionFinishTimer);
    if (smartSelectionActive) stopSmartSelectionMode(false);
    closeSelectionOverlay();
  }

  function isSmartSelectable(element) {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
    if (element === document.documentElement || element === document.body || element === selectionHost || element === effectsHost) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8 || rect.bottom <= 0 || rect.right <= 0
        || rect.top >= innerHeight || rect.left >= innerWidth) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function buildSmartCandidates(target) {
    const all = [];
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body && element !== document.documentElement) {
      if (isSmartSelectable(element)) all.push(element);
      element = element.parentElement;
    }
    if (!all.length) return [];
    const semanticTags = new Set(['BUTTON','A','INPUT','TEXTAREA','SELECT','IMG','VIDEO','CANVAS','PRE','CODE','TABLE','FORM','ARTICLE','SECTION','MAIN','NAV','ASIDE','DIALOG']);
    const semanticIndex = all.findIndex((item) => {
      const role = item.getAttribute('role');
      const rect = item.getBoundingClientRect();
      return semanticTags.has(item.tagName) || Boolean(role)
        || ((['block','flex','grid','inline-flex'].includes(getComputedStyle(item).display)) && rect.width >= 36 && rect.height >= 18);
    });
    smartSelectionIndex = semanticIndex >= 0 ? semanticIndex : 0;
    return all;
  }

  function renderSmartHighlight() {
    cancelAnimationFrame(smartHighlightFrame);
    smartHighlightFrame = requestAnimationFrame(() => {
      if (!smartSelectionActive || !smartSelectionTarget || !effectsHost || !effectsSmartHighlight) return;
      const rect = smartSelectionTarget.getBoundingClientRect();
      effectsHost.style.setProperty('--smart-left', `${rect.left}px`);
      effectsHost.style.setProperty('--smart-top', `${rect.top}px`);
      effectsHost.style.setProperty('--smart-width', `${rect.width}px`);
      effectsHost.style.setProperty('--smart-height', `${rect.height}px`);
      effectsSmartHighlight.classList.add('visible');
    });
  }

  function updateSmartTarget(target) {
    if (target === smartLastRawTarget && smartSelectionTarget) {
      renderSmartHighlight();
      return;
    }
    smartLastRawTarget = target;
    const candidates = buildSmartCandidates(target);
    if (!candidates.length) return;
    smartSelectionCandidates = candidates;
    smartSelectionTarget = candidates[smartSelectionIndex] || candidates[0];
    renderSmartHighlight();
  }

  function hideAreaOverlayForSmart() {
    selectionDrawing = false;
    selectionStartPoint = null;
    if (selectionBox) selectionBox.classList.remove('visible', 'complete');
    try {
      if (selectionUseTopLayer && selectionHost && selectionHost.open) selectionHost.close();
      else if (selectionHost) selectionHost.style.setProperty('display', 'none', 'important');
    } catch (_) {}
  }

  function startSmartSelectionMode(triggerMouseButton = null) {
    if (!selectionActive || smartSelectionActive) return;
    hideAreaOverlayForSmart();
    smartSelectionActive = true;
    smartSelectionConfirming = false;
    smartTriggerMouseButton = triggerMouseButton;
    ensureEffectsOverlay();
    openEffectsHost();
    if (effectsSmartHighlight) effectsSmartHighlight.classList.remove('confirm');
    const target = document.elementFromPoint(lastPointer.clientX, lastPointer.clientY);
    updateSmartTarget(target);
  }

  function stopSmartSelectionMode(restoreArea = true) {
    if (!smartSelectionActive) return;
    smartSelectionActive = false;
    smartSelectionConfirming = false;
    smartTriggerMouseButton = null;
    cancelAnimationFrame(smartHighlightFrame);
    if (effectsSmartHighlight) effectsSmartHighlight.classList.remove('visible', 'confirm');
    smartSelectionTarget = null;
    smartLastRawTarget = null;
    smartSelectionCandidates = [];
    if (restoreArea && selectionActive) openSelectionOverlay();
  }

  function cycleSmartSelection(direction) {
    if (!smartSelectionActive || !smartSelectionCandidates.length) return;
    smartSelectionIndex = Math.max(0, Math.min(smartSelectionCandidates.length - 1, smartSelectionIndex + direction));
    smartSelectionTarget = smartSelectionCandidates[smartSelectionIndex];
    renderSmartHighlight();
  }

  function confirmSmartSelection() {
    if (!smartSelectionActive || !smartSelectionTarget || smartSelectionConfirming) return;
    smartSelectionConfirming = true;
    const rect = smartSelectionTarget.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    if (effectsSmartHighlight) effectsSmartHighlight.classList.add('confirm');
    window.setTimeout(() => {
      stopSmartSelectionMode(false);
      selectionActive = false;
      applyAreaZoom({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }, 210);
  }

  function forceResetZoom() {
    if (smartSelectionActive) stopSmartSelectionMode(false);
    navigationActive = false;
    navigationHeld = false;
    navigationDragging = false;
    navigationDragPointerId = null;
    navigationLastDragPoint = null;
    window.clearTimeout(navigationTransitionTimer);
    cancelAnimationFrame(navigationAnimationFrame);
    navigationAnimationFrame = 0;
    active = false;
    held = false;
    areaZoomLatched = false;
    ++animationToken;
    window.clearTimeout(cleanupTimer);
    window.clearTimeout(settleTimer);
    stopMotionBlur();
    hideEffects(0);
    stopFloatingStabilizer();
    restoreInlineStyles();
  }

  function toggleAreaTool() {
    const now = performance.now();
    if (now - lastAreaToggleAt < 180) return;
    lastAreaToggleAt = now;
    if (selectionActive) cancelAreaSelection();
    else if (areaZoomLatched) deactivate();
    else startAreaSelection();
  }

  function startAreaSelection() {
    if (previewActive) return;
    if (selectionActive) return;
    if (active || savedInlineStyles) forceResetZoom();
    areaZoomLatched = false;
    selectionActive = openSelectionOverlay();
    if (!selectionActive) return;
    selectionDrawing = false;
    selectionStartPoint = null;
  }

  function applyAreaZoom(rect) {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const padding = Math.min(settings.areaPadding, Math.max(0, (Math.min(viewportWidth, viewportHeight) - 24) / 2));
    const availableWidth = Math.max(24, viewportWidth - padding * 2);
    const availableHeight = Math.max(24, viewportHeight - padding * 2);
    const calculatedFactor = Math.min(availableWidth / rect.width, availableHeight / rect.height);
    const factor = Number.isFinite(calculatedFactor) ? Math.max(1, calculatedFactor) : 1;
    const centerClient = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const origin = { x: window.scrollX + centerClient.x, y: window.scrollY + centerClient.y };
    const translation = { x: viewportWidth / 2 - centerClient.x, y: viewportHeight / 2 - centerClient.y };

    zoomTransformOriginClient = { ...centerClient };
    zoomTranslation = { ...translation };
    lockedClientPoint = { x: viewportWidth / 2, y: viewportHeight / 2 };
    active = true;
    areaZoomLatched = true;
    const element = getZoomElement();
    if (!element) return;
    element.setAttribute('data-scz-zoomed', 'true');
    beginScaleTransition(factor, settings.durationIn, origin, false, translation);
    showEffects(settings.durationIn);
    startFloatingStabilizer();
  }

  function isLikelyFloatingElement(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element === effectsHost || element === selectionHost || element.closest('smooth-cursor-zoom-effects, smooth-cursor-zoom-selector')) return false;
    let computed;
    try { computed = getComputedStyle(element); } catch (_) { return false; }
    if (computed.display === 'none' || computed.visibility === 'hidden') return false;
    if (computed.position !== 'fixed' && computed.position !== 'absolute') return false;
    const roleLike = element.matches('[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [popover], dialog, [data-radix-popper-content-wrapper]');
    const zIndex = Number.parseInt(computed.zIndex, 10);
    return roleLike || (Number.isFinite(zIndex) && zIndex >= 100);
  }

  function stabilizeFloatingElement(element) {
    if (!active || !isLikelyFloatingElement(element)) return;
    let saved = stabilizedElements.get(element);
    if (!saved) {
      saved = {
        value: element.style.getPropertyValue('translate'),
        priority: element.style.getPropertyPriority('translate'),
        appliedX: 0,
        appliedY: 0,
        baseline: null,
        baselineScale: 1
      };
      // Avoid overriding a site's deliberate individual translate. Most popup
      // libraries use transform instead, which remains untouched.
      if (saved.value && saved.value !== 'none') return;
      stabilizedElements.set(element, saved);
    }

    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (!rect.width || !rect.height || rect.width > viewportWidth * .96 || rect.height > viewportHeight * .96) return;

    let inTopLayer = false;
    try { inTopLayer = element.matches(':popover-open, dialog:modal'); } catch (_) {}
    const scale = inTopLayer ? 1 : Math.max(.01, Number.parseFloat(currentScale(getZoomElement())) || 1);
    if (!saved.baseline) {
      saved.baseline = { left: rect.left, top: rect.top };
      saved.baselineScale = scale;
    }

    const margin = 8;
    const outsideX = rect.left < margin || rect.right > viewportWidth - margin;
    const outsideY = rect.top < margin || rect.bottom > viewportHeight - margin;
    let targetLeft = rect.left;
    let targetTop = rect.top;

    // Existing menus get a baseline before the zoom animation. If a positioning
    // library transforms the already-transformed coordinates a second time,
    // bring the menu back to the visual position predicted by the page zoom.
    if (!inTopLayer && saved.baselineScale <= 1.05 && scale > 1.05) {
      const expectedLeft = zoomTransformOriginClient.x
        + scale * (saved.baseline.left - zoomTransformOriginClient.x) + zoomTranslation.x;
      const expectedTop = zoomTransformOriginClient.y
        + scale * (saved.baseline.top - zoomTransformOriginClient.y) + zoomTranslation.y;
      if (Math.abs(expectedLeft - rect.left) > 24) targetLeft = expectedLeft;
      if (Math.abs(expectedTop - rect.top) > 24) targetTop = expectedTop;
    }

    // New Popper-style overlays may already contain visual coordinates. Undo a
    // second mapping only when the result has actually left the viewport.
    if (!inTopLayer && outsideX && targetLeft === rect.left) {
      targetLeft = zoomTransformOriginClient.x
        + (rect.left - zoomTranslation.x - zoomTransformOriginClient.x) / scale;
    }
    if (!inTopLayer && outsideY && targetTop === rect.top) {
      targetTop = zoomTransformOriginClient.y
        + (rect.top - zoomTranslation.y - zoomTransformOriginClient.y) / scale;
    }

    targetLeft = Math.min(viewportWidth - margin - rect.width, Math.max(margin, targetLeft));
    targetTop = Math.min(viewportHeight - margin - rect.height, Math.max(margin, targetTop));
    const dx = targetLeft - rect.left;
    const dy = targetTop - rect.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;

    saved.appliedX += dx / scale;
    saved.appliedY += dy / scale;
    element.style.setProperty('translate', `${saved.appliedX}px ${saved.appliedY}px`, 'important');
  }

  function queueFloatingCandidates(elements) {
    if (!active) return;
    for (const element of elements) {
      if (element instanceof HTMLElement) floatingCandidates.add(element);
    }
    if (floatingScanFrame) return;
    floatingScanFrame = requestAnimationFrame(() => {
      floatingScanFrame = 0;
      const candidates = [...floatingCandidates];
      floatingCandidates.clear();
      for (const element of candidates) stabilizeFloatingElement(element);
    });
  }

  function startFloatingStabilizer() {
    stopFloatingStabilizer();
    if (!siteProfile.stabilizePopups) return;
    const selector = '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [popover], dialog, [data-radix-popper-content-wrapper]';
    queueFloatingCandidates(document.querySelectorAll(selector));
    window.setTimeout(() => {
      if (active) queueFloatingCandidates(document.querySelectorAll(selector));
    }, settings.durationIn + 80);
    floatingObserver = new MutationObserver((mutations) => {
      const candidates = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(selector)) candidates.add(node);
          node.querySelectorAll(selector).forEach((item) => candidates.add(item));
        }
      }
      if (candidates.size) queueFloatingCandidates(candidates);
    });
    floatingObserver.observe(document.documentElement, {
      subtree: true,
      childList: true
    });
  }

  function stopFloatingStabilizer() {
    if (floatingObserver) floatingObserver.disconnect();
    floatingObserver = null;
    cancelAnimationFrame(floatingScanFrame);
    floatingScanFrame = 0;
    floatingCandidates.clear();
    for (const [element, saved] of stabilizedElements) {
      if (!element.isConnected) continue;
      if (saved.value) element.style.setProperty('translate', saved.value, saved.priority);
      else element.style.removeProperty('translate');
    }
    stabilizedElements.clear();
  }

  function ensureEffectsOverlay() {
    if (effectsHost && effectsHost.isConnected) return;
    const element = getRoot();
    if (!element) return;

    effectsHost = document.createElement('smooth-cursor-zoom-effects');
    effectsHost.setAttribute('popover', 'manual');
    effectsUseTopLayer = typeof effectsHost.showPopover === 'function';
    if (!effectsUseTopLayer) effectsHost.removeAttribute('popover');

    const hostStyles = {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      margin: '0', padding: '0', border: '0', overflow: 'hidden',
      background: 'transparent', pointerEvents: 'none', zIndex: '2147483647'
    };
    for (const [property, value] of Object.entries(hostStyles)) {
      effectsHost.style.setProperty(property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`), value, 'important');
    }
    if (!effectsUseTopLayer) effectsHost.style.setProperty('display', 'none', 'important');
    if (typeof CSS.registerProperty === 'function') {
      for (const name of ['--vignette-x', '--vignette-y']) {
        try { CSS.registerProperty({ name, syntax: '<length-percentage>', inherits: true, initialValue: '50%' }); } catch (_) {}
      }
    }
    effectsHost.style.setProperty(
      'transition',
      '--vignette-x 280ms cubic-bezier(.65,0,.35,1), --vignette-y 280ms cubic-bezier(.65,0,.35,1)',
      'important'
    );

    const shadow = effectsHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: dark; }
        *, *::before, *::after { box-sizing: border-box; }
        .motion-blur-plane {
          position: absolute; inset: 0; z-index: 40; opacity: 0; pointer-events: none;
          background: rgba(0,0,0,.004);
          backdrop-filter: blur(var(--transition-blur, 0px));
          -webkit-backdrop-filter: blur(var(--transition-blur, 0px));
        }
        .frame {
          position: absolute; inset: 0; overflow: hidden; opacity: 0;
          pointer-events: none; transition: opacity 320ms ease-in-out;
        }
        .frame.visible { opacity: 1; }
        .frame:not(.visible),
        .frame:not(.visible) .noise,
        .frame:not(.visible) .flicker { animation-play-state: paused; }
        .layer { position: absolute; inset: -2px; pointer-events: none; }
        .vignette {
          background: radial-gradient(ellipse at var(--vignette-x) var(--vignette-y),
            transparent 42%, rgba(0, 0, 0, calc(var(--vignette) * .14)) 64%,
            rgba(0, 0, 0, calc(var(--vignette) * .92)) 100%);
        }
        .pixels {
          background-image:
            repeating-linear-gradient(to bottom,
              transparent 0 calc(var(--pixel-size) - 1px),
              rgba(0,0,0,.58) calc(var(--pixel-size) - 1px) var(--pixel-size)),
            repeating-linear-gradient(to right,
              rgba(255,48,64,.64) 0 var(--subpixel),
              rgba(42,255,142,.54) var(--subpixel) var(--subpixel-2),
              rgba(68,105,255,.66) var(--subpixel-2) var(--pixel-size));
          background-size: 100% var(--pixel-size), var(--pixel-size) 100%;
          mix-blend-mode: soft-light;
          filter: saturate(1.3) contrast(1.08);
          opacity: calc(var(--pixels) * .82);
        }
        .mask {
          background: repeating-linear-gradient(90deg,
            rgba(255, 45, 70, .42) 0 1px,
            rgba(35, 255, 155, .30) 1px 2px,
            rgba(70, 110, 255, .42) 2px 3px);
          background-size: 3px 100%;
          mix-blend-mode: soft-light;
          opacity: calc(var(--rgb) * .48);
        }
        .tone {
          background:
            linear-gradient(180deg, rgba(30, 55, 90, .16), transparent 35%, rgba(255, 130, 52, .13)),
            radial-gradient(ellipse at 50% 45%, rgba(255, 210, 150, .08), rgba(8, 15, 28, .22));
          mix-blend-mode: soft-light;
          opacity: calc(var(--tone) * .72);
        }
        .flicker {
          background: #07101a;
          opacity: 0;
          animation: screen-flicker 4.6s steps(1, end) infinite;
        }
        .noise {
          inset: -25%;
          background:
            repeating-conic-gradient(from 17deg at 37% 43%, rgba(255,255,255,.12) 0 .7deg, transparent .7deg 2.1deg),
            repeating-linear-gradient(117deg, transparent 0 2px, rgba(255,255,255,.08) 2px 3px, transparent 3px 7px);
          background-size: 83px 71px, 57px 61px;
          mix-blend-mode: overlay;
          opacity: calc(var(--noise) * .28);
          animation: noise-shift 230ms steps(2, end) infinite;
        }
        .smart-highlight {
          position: fixed; left: var(--smart-left, 0px); top: var(--smart-top, 0px);
          width: var(--smart-width, 0px); height: var(--smart-height, 0px);
          z-index: 46; opacity: 0; pointer-events: none; border-radius: 9px;
          background: linear-gradient(135deg, rgba(116,224,186,.07), rgba(110,148,255,.05));
          box-shadow: 0 0 0 1px rgba(255,255,255,.62) inset, 0 0 24px rgba(116,224,186,.26);
          transition: left 100ms cubic-bezier(.2,.8,.2,1), top 100ms cubic-bezier(.2,.8,.2,1), width 100ms cubic-bezier(.2,.8,.2,1), height 100ms cubic-bezier(.2,.8,.2,1), opacity 140ms ease;
        }
        .smart-highlight.visible { opacity: 1; }
        .smart-highlight::before {
          position: absolute; inset: -2px; padding: 2px; border-radius: 11px; content: "";
          background: linear-gradient(110deg, #74e0ba, #fff, #7aa7ff, #74e0ba);
          background-size: 240% 100%;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          animation: smart-border-flow 2.2s linear infinite;
        }
        .smart-highlight::after {
          position: absolute; inset: 7px; border: 1px solid rgba(116,224,186,.16);
          border-radius: 5px; content: "";
        }
        .smart-highlight.confirm { animation: smart-confirm 220ms cubic-bezier(.16,1,.3,1) both; }
        .navigation-lock {
          position: absolute; left: var(--nav-lock-x, 50%); top: var(--nav-lock-y, 50%); z-index: 45;
          width: 76px; height: 76px; border: 1px solid rgba(116,224,186,.48);
          border-radius: 50%; opacity: 0; pointer-events: none;
          transform: translate(-50%,-50%) scale(.72);
          box-shadow: 0 0 0 1px rgba(255,255,255,.12) inset, 0 0 28px rgba(116,224,186,.2);
        }
        .navigation-lock::before, .navigation-lock::after {
          position: absolute; left: 50%; top: 50%; content: ""; background: rgba(116,224,186,.42);
          transform: translate(-50%,-50%);
        }
        .navigation-lock::before { width: 108px; height: 1px; }
        .navigation-lock::after { width: 1px; height: 108px; }
        .navigation-lock.enter { animation: navigation-enter 430ms cubic-bezier(.65,0,.35,1) both; }
        .navigation-lock.exit { animation: navigation-exit 330ms cubic-bezier(.65,0,.35,1) both; }
        .cursor-anchor {
          --cursor-x: 50vw; --cursor-y: 50vh;
          position: absolute; left: 0; top: 0; z-index: 50;
          width: 0; height: 0; opacity: 0;
          pointer-events: none;
          transform: translate3d(var(--cursor-x), var(--cursor-y), 0);
          transition: opacity 140ms ease-in-out;
        }
        .cursor-anchor.visible { opacity: 1; }
        .cursor-anchor.visible.morphing { opacity: .28; }
        .cursor-scale {
          width: 32px; height: 32px;
          transform: scale(var(--cursor-scale, 1));
          transform-origin: 0 0;
          transition: transform 320ms cubic-bezier(.65,0,.35,1), opacity 120ms linear;
        }
        .cursor-anchor svg {
          display: block; width: 32px; height: 32px; overflow: visible;
          filter: drop-shadow(0 1px 1px rgba(0,0,0,.5));
        }
        .cursor-shape { display: none; }
        .cursor-anchor[data-kind="arrow"] .shape-arrow,
        .cursor-anchor[data-kind="pointer"] .shape-pointer,
        .cursor-anchor[data-kind="text"] .shape-text,
        .cursor-anchor[data-kind="crosshair"] .shape-crosshair,
        .cursor-anchor[data-kind="move"] .shape-move,
        .cursor-anchor[data-kind="grab"] .shape-grab,
        .cursor-anchor[data-kind="grabbing"] .shape-grab,
        .cursor-anchor[data-kind="wait"] .shape-wait,
        .cursor-anchor[data-kind="resize"] .shape-resize { display: block; }
        .cursor-anchor[data-kind="pointer"] svg { transform: translate(-8px, -1px); }
        .cursor-anchor[data-kind="text"] svg,
        .cursor-anchor[data-kind="crosshair"] svg,
        .cursor-anchor[data-kind="move"] svg,
        .cursor-anchor[data-kind="grab"] svg,
        .cursor-anchor[data-kind="grabbing"] svg,
        .cursor-anchor[data-kind="wait"] svg,
        .cursor-anchor[data-kind="resize"] svg { transform: translate(-16px, -16px); }
        .cursor-anchor[data-kind="grabbing"] svg { transform: translate(-16px, -16px) scale(.9); }
        @keyframes noise-shift {
          0% { transform: translate3d(-2%, 1%, 0) rotate(.01deg); }
          50% { transform: translate3d(2%, -1%, 0) rotate(-.01deg); }
          100% { transform: translate3d(0, 2%, 0); }
        }
        @keyframes screen-flicker {
          0%, 95%, 99%, 100% { opacity: 0; }
          96% { opacity: calc(var(--flicker) * .08); }
          97% { opacity: calc(var(--flicker) * .2); }
          98% { opacity: calc(var(--flicker) * .035); }
        }
        @keyframes smart-border-flow { to { background-position: 240% 0; } }
        @keyframes smart-confirm {
          45% { transform: scale(1.018); opacity: 1; box-shadow: 0 0 44px rgba(116,224,186,.68); }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes navigation-enter {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.7); }
          48% { opacity: .82; transform: translate(-50%,-50%) scale(1.06); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(1.22); }
        }
        @keyframes navigation-exit {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(1.15); }
          46% { opacity: .62; transform: translate(-50%,-50%) scale(.96); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(.76); }
        }
        @media (prefers-reduced-motion: reduce) {
          .noise, .frame { animation: none !important; }
        }
      </style>
      <div class="motion-blur-plane"></div>
      <div class="frame">
        <div class="layer tone"></div>
        <div class="layer vignette"></div>
        <div class="layer pixels"></div>
        <div class="layer mask"></div>
        <div class="layer noise"></div>
        <div class="layer flicker"></div>
      </div>
      <div class="smart-highlight"></div>
      <div class="navigation-lock"></div>
      <div class="cursor-anchor" data-kind="arrow">
        <div class="cursor-scale">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <g class="cursor-shape shape-arrow">
              <path d="M2 1.5 2.2 26l6.1-6.2 5.4 10.5 5-2.6-5.5-10.1h8.9Z" fill="#fff" stroke="#080b10" stroke-width="2.2" stroke-linejoin="round"/>
            </g>
            <g class="cursor-shape shape-pointer">
              <path d="M9 2a2.2 2.2 0 0 1 4.4 0v8.8-2.4a2.1 2.1 0 0 1 4.2 0v2.9-1.8a2.1 2.1 0 0 1 4.2 0v2.8-1.2a2.1 2.1 0 0 1 4.2 0v7.3c0 7.2-4.5 11.3-10.6 11.3-4.1 0-6.4-2.1-8.2-5L3.8 19a2.5 2.5 0 0 1 4.1-2.8L9 17.5Z" fill="#fff" stroke="#080b10" stroke-width="2" stroke-linejoin="round"/>
            </g>
            <g class="cursor-shape shape-text" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round">
              <path d="M11 4h10M16 4v24M11 28h10"/><path d="M16 4v24" stroke="#080b10" stroke-width="5"/><path d="M11 4h10M16 4v24M11 28h10"/>
            </g>
            <g class="cursor-shape shape-crosshair" fill="none" stroke-linecap="round">
              <circle cx="16" cy="16" r="6" stroke="#080b10" stroke-width="4"/><path d="M16 2v8m0 12v8M2 16h8m12 0h8" stroke="#080b10" stroke-width="4"/><circle cx="16" cy="16" r="6" stroke="#fff" stroke-width="1.8"/><path d="M16 2v8m0 12v8M2 16h8m12 0h8" stroke="#fff" stroke-width="1.8"/>
            </g>
            <g class="cursor-shape shape-move" fill="#fff" stroke="#080b10" stroke-width="1.5" stroke-linejoin="round">
              <path d="m16 1 5 6h-3v7h7v-3l6 5-6 5v-3h-7v7h3l-5 6-5-6h3v-7H7v3l-6-5 6-5v3h7V7h-3Z"/>
            </g>
            <g class="cursor-shape shape-grab">
              <path d="M8.5 13V7.2a2 2 0 0 1 4 0v4.3-6.1a2 2 0 0 1 4 0v6-4.9a2 2 0 0 1 4 0v6-3.7a2 2 0 0 1 4 0v9.4c0 7.1-4.1 11-10.1 11-4.4 0-7.2-2.1-9.2-6.1l-2-4.1a2.4 2.4 0 0 1 4.1-2.5l1.2 1.7Z" fill="#fff" stroke="#080b10" stroke-width="2" stroke-linejoin="round"/>
            </g>
            <g class="cursor-shape shape-wait" fill="none" stroke-linecap="round">
              <circle cx="16" cy="16" r="11" stroke="#080b10" stroke-width="6"/><circle cx="16" cy="16" r="11" stroke="#fff" stroke-width="3" opacity=".45"/><path d="M16 5a11 11 0 0 1 10.5 7.8" stroke="#74e0ba" stroke-width="3.2"/>
            </g>
            <g class="cursor-shape shape-resize" fill="#fff" stroke="#080b10" stroke-width="1.8" stroke-linejoin="round">
              <path d="M5 3h10l-3.5 3.5 14 14L29 17v10H19l3.5-3.5-14-14L5 13Z"/>
            </g>
          </svg>
        </div>
      </div>`;

    effectsFrame = shadow.querySelector('.frame');
    effectsMotionBlurPlane = shadow.querySelector('.motion-blur-plane');
    effectsCursorAnchor = shadow.querySelector('.cursor-anchor');
    effectsCursorScale = shadow.querySelector('.cursor-scale');
    effectsNavigationLock = shadow.querySelector('.navigation-lock');
    effectsSmartHighlight = shadow.querySelector('.smart-highlight');
    element.append(effectsHost);
  }

  function cursorKindFromTarget(target) {
    let value = 'auto';
    try {
      if (target instanceof Element) value = getComputedStyle(target).cursor || 'auto';
    } catch (_) { /* Detached targets can disappear during pointer movement. */ }

    value = value.toLowerCase();
    if (value.includes('pointer')) return 'pointer';
    if (value.includes('text') || value.includes('vertical-text')) return 'text';
    if (value.includes('crosshair') || value.includes('cell')) return 'crosshair';
    if (value.includes('wait') || value.includes('progress')) return 'wait';
    if (value.includes('resize') || value.includes('col-resize') || value.includes('row-resize')) return 'resize';
    if (value.includes('move') || value.includes('grab') || value.includes('all-scroll')) return 'move';

    try {
      if (target instanceof Element && target.closest('a, button, summary, [role="button"], input[type="button"], input[type="submit"]')) return 'pointer';
      if (target instanceof Element && target.closest('input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], textarea, [contenteditable="true"]')) return 'text';
    } catch (_) {}
    return 'arrow';
  }

  function updateCustomCursorPosition() {
    if (!effectsCursorAnchor) return;
    effectsCursorAnchor.style.setProperty('--cursor-x', `${lastPointer.clientX}px`);
    effectsCursorAnchor.style.setProperty('--cursor-y', `${lastPointer.clientY}px`);
    effectsCursorAnchor.dataset.kind = lastPointer.cursorType || 'arrow';
  }

  function restoreHiddenCursorElement() {
    if (!hiddenCursorElement || !hiddenCursorInline) return;
    if (hiddenCursorInline.value) {
      hiddenCursorElement.style.setProperty('cursor', hiddenCursorInline.value, hiddenCursorInline.priority);
    } else {
      hiddenCursorElement.style.removeProperty('cursor');
    }
    hiddenCursorElement = null;
    hiddenCursorInline = null;
  }

  function hideCursorOnElement(element) {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) element = getRoot();
    if (element === hiddenCursorElement) return;
    restoreHiddenCursorElement();
    hiddenCursorElement = element;
    hiddenCursorInline = {
      value: element.style.getPropertyValue('cursor'),
      priority: element.style.getPropertyPriority('cursor')
    };
    element.style.setProperty('cursor', 'none', 'important');
  }

  function hideNativeCursor() {
    customCursorActive = true;
    hideCursorOnElement(lastPointerTarget || getRoot());
  }

  function restoreNativeCursor() {
    customCursorActive = false;
    restoreHiddenCursorElement();
  }

  function syncEffectsSettings() {
    ensureEffectsOverlay();
    if (!effectsHost || !effectsFrame) return;
    const pixelSize = settings.pixelSize;
    const focusPoint = navigationActive
      ? { x: lastPointer.clientX, y: lastPointer.clientY }
      : lockedClientPoint;
    const focusX = `${focusPoint.x}px`;
    const focusY = `${focusPoint.y}px`;
    effectsHost.style.setProperty('--vignette', String(settings.vignette / 100));
    const vignetteFollowsFocus = navigationActive || settings.vignetteCenter === 'focus';
    effectsHost.style.setProperty('--vignette-x', vignetteFollowsFocus ? focusX : '50%');
    effectsHost.style.setProperty('--vignette-y', vignetteFollowsFocus ? focusY : '50%');
    effectsHost.style.setProperty('--pixels', String(settings.pixelStrength / 100));
    effectsHost.style.setProperty('--pixel-size', `${pixelSize}px`);
    effectsHost.style.setProperty('--subpixel', `${pixelSize / 3}px`);
    effectsHost.style.setProperty('--subpixel-2', `${(pixelSize * 2) / 3}px`);
    const performanceProfile = usePerformanceProfile();
    effectsHost.style.setProperty('--tone', String(settings.toneStrength / 100));
    effectsHost.style.setProperty('--noise', String(performanceProfile ? 0 : settings.noiseStrength / 100));
    effectsHost.style.setProperty('--rgb', String(settings.rgbStrength / 100));
    effectsHost.style.setProperty('--flicker', String(performanceProfile ? 0 : settings.flickerStrength / 100));
  }

  function openEffectsHost() {
    if (!effectsHost) return;
    try {
      if (effectsUseTopLayer) {
        if (!effectsHost.matches(':popover-open')) effectsHost.showPopover();
      } else {
        effectsHost.style.setProperty('display', 'block', 'important');
      }
    } catch (_) {
      effectsHost.style.setProperty('display', 'block', 'important');
    }
  }

  function hasImageEffects(value) {
    return value.vignette > 0 || value.pixelStrength > 0
      || value.toneStrength > 0 || value.noiseStrength > 0 || value.rgbStrength > 0
      || value.flickerStrength > 0 || value.pageDefocus > 0
      || value.brightness !== 100 || value.contrast !== 100;
  }

  function showEffects(duration) {
    window.clearTimeout(effectsHideTimer);
    syncEffectsSettings();
    if (!effectsHost || !effectsFrame) return;

    const showImageEffects = hasImageEffects(settings);
    const showLargeCursor = settings.cursorScale > 1.001;
    if (!showImageEffects && !showLargeCursor) return;

    openEffectsHost();
    effectsFrame.style.transitionDuration = `${duration}ms`;
    if (effectsCursorScale) effectsCursorScale.style.transitionDuration = `${duration}ms`;

    if (showLargeCursor && effectsCursorAnchor && effectsCursorScale) {
      lastPointer.cursorType = cursorKindFromTarget(lastPointerTarget);
      updateCustomCursorPosition();
      effectsHost.style.setProperty('--cursor-scale', '1');
      effectsCursorAnchor.classList.add('visible');
      window.setTimeout(() => {
        if (!active || navigationActive) return;
        hideNativeCursor();
        effectsHost.style.setProperty('--cursor-scale', String(settings.cursorScale));
      }, 70);
    }

    requestAnimationFrame(() => {
      if (!active) return;
      if (showImageEffects && effectsFrame) effectsFrame.classList.add('visible');
    });
  }

  function hideEffects(duration) {
    window.clearTimeout(effectsHideTimer);
    window.clearTimeout(restoreCursorTimer);
    cancelAnimationFrame(cursorMoveFrame);
    cursorMoveFrame = 0;
    if (!effectsHost || !effectsFrame) {
      restoreNativeCursor();
      return;
    }
    effectsFrame.style.transitionDuration = `${duration}ms`;
    effectsFrame.classList.remove('visible');
    if (effectsCursorScale) effectsCursorScale.style.transitionDuration = `${duration}ms`;
    effectsHost.style.setProperty('--cursor-scale', '1');

    effectsHideTimer = window.setTimeout(() => {
      if (active || !effectsHost) return;
      if (effectsCursorAnchor) effectsCursorAnchor.classList.remove('visible');
      restoreCursorTimer = window.setTimeout(() => { if (!active) restoreNativeCursor(); }, 90);
      try {
        if (effectsUseTopLayer) {
          if (effectsHost.matches(':popover-open')) effectsHost.hidePopover();
        } else {
          effectsHost.style.setProperty('display', 'none', 'important');
        }
      } catch (_) {
        if (!effectsUseTopLayer) effectsHost.style.setProperty('display', 'none', 'important');
      }
    }, duration + 60);
  }

  function refreshEffectsInPlace(duration = 120) {
    window.clearTimeout(effectsHideTimer);
    syncEffectsSettings();
    if (!effectsHost || !effectsFrame) return;

    const showImageEffects = hasImageEffects(settings);
    const showLargeCursor = settings.cursorScale > 1.001;
    if (!blurAnimation) applyPersistentPageDefocus();
    effectsFrame.style.transitionDuration = `${duration}ms`;
    if (effectsCursorScale) effectsCursorScale.style.transitionDuration = `${duration}ms`;

    if (showImageEffects || showLargeCursor) openEffectsHost();
    effectsFrame.classList.toggle('visible', showImageEffects);

    if (showLargeCursor && effectsCursorAnchor) {
      updateCustomCursorPosition();
      hideNativeCursor();
      effectsCursorAnchor.classList.add('visible');
      effectsHost.style.setProperty('--cursor-scale', String(settings.cursorScale));
    } else {
      if (effectsCursorAnchor) effectsCursorAnchor.classList.remove('visible');
      restoreNativeCursor();
    }

    if (!showImageEffects && !showLargeCursor) {
      try {
        if (effectsUseTopLayer && effectsHost.matches(':popover-open')) effectsHost.hidePopover();
        else if (!effectsUseTopLayer) effectsHost.style.setProperty('display', 'none', 'important');
      } catch (_) {}
    }
  }

  function startLivePreview(value) {
    if (selectionActive) cancelAreaSelection();
    const next = sanitizeSettings(value || storedSettings);
    if (previewActive) {
      const previousZoom = settings.zoom;
      settings = next;
      if (!active) activate();
      else {
        if (Math.abs(previousZoom - settings.zoom) > 0.001) {
          beginScaleTransition(settings.zoom, 150, null, false);
        }
        refreshEffectsInPlace(100);
      }
      return;
    }

    if (active) deactivate();
    previewActive = true;
    held = false;
    settings = next;
    activate();
  }

  function updateLivePreview(value) {
    if (!previewActive) {
      startLivePreview(value);
      return;
    }
    const previousZoom = settings.zoom;
    settings = sanitizeSettings(value || storedSettings);
    if (!active) {
      activate();
      return;
    }
    if (Math.abs(previousZoom - settings.zoom) > 0.001) {
      beginScaleTransition(settings.zoom, 150, null, false);
    }
    refreshEffectsInPlace(80);
  }

  function stopLivePreview() {
    if (!previewActive) return;
    previewActive = false;
    held = false;
    if (active || savedInlineStyles) deactivate();
    settings = storedSettings;
  }

  function pulseNavigationLock(mode) {
    if (!effectsNavigationLock || !effectsHost) return;
    effectsHost.style.setProperty('--nav-lock-x', `${lastPointer.clientX}px`);
    effectsHost.style.setProperty('--nav-lock-y', `${lastPointer.clientY}px`);
    effectsNavigationLock.classList.remove('enter', 'exit');
    void effectsNavigationLock.offsetWidth;
    effectsNavigationLock.classList.add(mode);
  }

  function showNavigationCursor(kind = 'grab') {
    ensureEffectsOverlay();
    if (!effectsHost || !effectsCursorAnchor) return;
    openEffectsHost();
    effectsCursorAnchor.style.setProperty('--cursor-x', `${lastPointer.clientX}px`);
    effectsCursorAnchor.style.setProperty('--cursor-y', `${lastPointer.clientY}px`);
    effectsHost.style.setProperty('--cursor-scale', String(Math.max(1, settings.cursorScale)));
    effectsCursorAnchor.classList.add('visible');
    if (effectsCursorAnchor.dataset.kind !== kind) {
      const token = ++cursorMorphToken;
      effectsCursorAnchor.classList.add('morphing');
      window.setTimeout(() => {
        if (token !== cursorMorphToken || !effectsCursorAnchor) return;
        effectsCursorAnchor.dataset.kind = kind;
        effectsCursorAnchor.classList.remove('morphing');
      }, 70);
    }
    hideNativeCursor();
  }

  function startNavigation() {
    if (!active || selectionActive || navigationActive) return;
    const element = getZoomElement();
    if (!element) return;

    navigationActive = true;
    navigationDragging = false;
    navigationDragPointerId = null;
    navigationLastDragPoint = null;
    navigationHadCustomCursor = customCursorActive;
    navigationPreviousCursorType = lastPointer.cursorType || 'arrow';
    navigationCurrentTranslate = numericTranslate(element);
    navigationTargetTranslate = { ...navigationCurrentTranslate };
    cancelAnimationFrame(navigationAnimationFrame);
    navigationAnimationFrame = 0;

    // Enter navigation without moving either the page or the pointer. Only the
    // cursor morphs into a grab hand at its exact current hotspot.
    showNavigationCursor('grab');
    pulseNavigationLock('enter');
    syncEffectsSettings();
  }

  function runNavigationSmoothing() {
    if (!navigationActive || !navigationDragging) {
      navigationAnimationFrame = 0;
      return;
    }
    const element = getZoomElement();
    const dx = navigationTargetTranslate.x - navigationCurrentTranslate.x;
    const dy = navigationTargetTranslate.y - navigationCurrentTranslate.y;
    const distance = Math.hypot(dx, dy);
    const alpha = distance > 80 ? .38 : distance > 24 ? .31 : .24;
    navigationCurrentTranslate.x += dx * alpha;
    navigationCurrentTranslate.y += dy * alpha;
    setImportant(element, 'transition', 'none');
    setImportant(element, 'translate', `${navigationCurrentTranslate.x}px ${navigationCurrentTranslate.y}px`);
    zoomTranslation = { ...navigationCurrentTranslate };
    if (distance > .08) navigationAnimationFrame = requestAnimationFrame(runNavigationSmoothing);
    else navigationAnimationFrame = 0;
  }

  function beginNavigationDrag(event) {
    if (!navigationActive || event.button !== 0) return false;
    navigationDragging = true;
    navigationSuppressClick = true;
    navigationDragPointerId = event.pointerId;
    navigationLastDragPoint = { x: event.clientX, y: event.clientY };
    try { if (event.target && event.target.setPointerCapture) event.target.setPointerCapture(event.pointerId); } catch (_) {}
    navigationCurrentTranslate = numericTranslate(getZoomElement());
    navigationTargetTranslate = { ...navigationCurrentTranslate };
    showNavigationCursor('grabbing');
    return true;
  }

  function updateNavigationDrag(event) {
    if (!navigationActive || !navigationDragging || !navigationLastDragPoint) return;
    if (navigationDragPointerId !== null && event.pointerId !== navigationDragPointerId) return;
    const dx = (event.clientX - navigationLastDragPoint.x) * settings.navigationSensitivity;
    const dy = (event.clientY - navigationLastDragPoint.y) * settings.navigationSensitivity;
    navigationLastDragPoint = { x: event.clientX, y: event.clientY };
    navigationTargetTranslate.x += dx;
    navigationTargetTranslate.y += dy;
    if (!navigationAnimationFrame) navigationAnimationFrame = requestAnimationFrame(runNavigationSmoothing);
  }

  function endNavigationDrag(event) {
    if (!navigationDragging) return;
    if (navigationDragPointerId !== null && event.pointerId !== navigationDragPointerId) return;
    cancelAnimationFrame(navigationAnimationFrame);
    navigationAnimationFrame = 0;
    try { if (event.target && event.target.releasePointerCapture) event.target.releasePointerCapture(event.pointerId); } catch (_) {}
    navigationDragging = false;
    navigationDragPointerId = null;
    navigationLastDragPoint = null;
    navigationCurrentTranslate = numericTranslate(getZoomElement());
    navigationTargetTranslate = { ...navigationCurrentTranslate };
    showNavigationCursor('grab');
    window.setTimeout(() => { navigationSuppressClick = false; }, 400);
  }

  function stopNavigation() {
    if (!navigationActive) return;
    cancelAnimationFrame(navigationAnimationFrame);
    navigationAnimationFrame = 0;
    window.clearTimeout(navigationTransitionTimer);
    navigationActive = false;
    navigationHeld = false;
    navigationSuppressPointerUp = navigationDragging;
    if (navigationDragging) window.setTimeout(() => { navigationSuppressClick = false; }, 500);
    navigationDragging = false;
    navigationDragPointerId = null;
    navigationLastDragPoint = null;

    // No positional animation is applied here: the pointer and page stay at
    // their exact coordinates while the grab cursor eases back to its old form.
    const element = getZoomElement();
    if (element) {
      navigationCurrentTranslate = numericTranslate(element);
      navigationTargetTranslate = { ...navigationCurrentTranslate };
      zoomTranslation = { ...navigationCurrentTranslate };
      setImportant(element, 'transition', 'none');
      restoreManagedProperty(element, 'will-change');
    }

    pulseNavigationLock('exit');
    lastPointer.cursorType = navigationPreviousCursorType;
    showNavigationCursor(navigationPreviousCursorType);
    syncEffectsSettings();

    navigationTransitionTimer = window.setTimeout(() => {
      if (navigationActive) return;
      if (navigationHadCustomCursor) {
        updateCustomCursorPosition();
      } else {
        if (effectsCursorAnchor) effectsCursorAnchor.classList.remove('visible');
        window.setTimeout(() => { if (!navigationActive) restoreNativeCursor(); }, 90);
      }
      refreshEffectsInPlace(160);
    }, 170);
  }

  function activate() {
    if (active) return;
    active = true;

    const element = getZoomElement();
    if (!element) return;

    const activationPoint = previewActive
      ? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      : { x: lastPointer.clientX, y: lastPointer.clientY };
    lockedClientPoint = activationPoint;
    zoomTransformOriginClient = { ...lockedClientPoint };
    zoomTranslation = { x: 0, y: 0 };
    const origin = {
      x: window.scrollX + lockedClientPoint.x,
      y: window.scrollY + lockedClientPoint.y
    };

    element.setAttribute('data-scz-zoomed', 'true');
    beginScaleTransition(settings.zoom, settings.durationIn, origin, false);
    showEffects(settings.durationIn);
    startFloatingStabilizer();
  }

  function deactivate() {
    if (!active && !savedInlineStyles) return;
    if (navigationActive) stopNavigation();
    active = false;
    areaZoomLatched = false;
    stopFloatingStabilizer();
    hideEffects(settings.durationOut);
    beginScaleTransition(1, settings.durationOut, null, true);
  }

  function shortcutMatches(event, shortcut = settings.shortcut) {
    if (Number.isInteger(shortcut.mouseButton)) return false;
    return event.code === shortcut.code
      && event.ctrlKey === shortcut.ctrl
      && event.altKey === shortcut.alt
      && event.shiftKey === shortcut.shift
      && event.metaKey === shortcut.meta;
  }

  function mouseShortcutMatches(event, shortcut) {
    return Number.isInteger(shortcut.mouseButton)
      && event.button === shortcut.mouseButton
      && event.ctrlKey === shortcut.ctrl
      && event.altKey === shortcut.alt
      && event.shiftKey === shortcut.shift
      && event.metaKey === shortcut.meta;
  }

  function requiredModifierWasReleased(event, shortcut = settings.shortcut) {
    return (shortcut.ctrl && !event.ctrlKey)
      || (shortcut.alt && !event.altKey)
      || (shortcut.shift && !event.shiftKey)
      || (shortcut.meta && !event.metaKey);
  }

  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event) {
    if (selectionActive && event.code === 'Escape') {
      consume(event);
      cancelAreaSelection();
      sharedHoldTriggered = true;
      return;
    }
    if (previewActive || event.isComposing) return;

    if (smartSelectionActive && !smartSelectionConfirming) {
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        consume(event);
        cycleSmartSelection(event.code === 'ArrowUp' ? 1 : -1);
        return;
      }
      if (event.code === 'Enter') {
        consume(event);
        confirmSmartSelection();
        return;
      }
    }

    // Context-aware reuse: while the area tool is open, the navigation
    // shortcut temporarily becomes the smart element selector shortcut.
    if (selectionActive && shortcutMatches(event, settings.navigationShortcut)) {
      consume(event);
      if (!event.repeat) startSmartSelectionMode(null);
      return;
    }

    if (active && !selectionActive && shortcutMatches(event, settings.navigationShortcut)) {
      consume(event);
      if (event.repeat) return;
      navigationHeld = true;
      startNavigation();
      return;
    }

    if (selectionActive) {
      const isCancelShortcut = shortcutMatches(event, settings.shortcut)
        || (settings.areaMode === 'separate' && shortcutMatches(event, settings.areaShortcut));
      if (!isCancelShortcut) {
        consume(event);
        return;
      }
    }

    if (settings.areaMode === 'separate' && shortcutMatches(event, settings.areaShortcut)) {
      consume(event);
      if (event.repeat) return;
      toggleAreaTool();
      return;
    }

    if (!shortcutMatches(event, settings.shortcut)) return;
    consume(event);
    if (event.repeat) return;

    if (settings.areaMode === 'shared') {
      window.clearTimeout(sharedHoldTimer);
      sharedShortcutDown = true;
      sharedHoldTriggered = false;
      sharedDismissedOnDown = false;

      if (selectionActive) {
        cancelAreaSelection();
        sharedDismissedOnDown = true;
        return;
      }
      if (areaZoomLatched || active) {
        deactivate();
        sharedDismissedOnDown = true;
        return;
      }

      sharedHoldTimer = window.setTimeout(() => {
        if (!sharedShortcutDown || sharedDismissedOnDown) return;
        sharedHoldTriggered = true;
        startAreaSelection();
      }, settings.areaHoldDelay);
      return;
    }

    if (selectionActive) {
      cancelAreaSelection();
      return;
    }
    if (areaZoomLatched) {
      deactivate();
      return;
    }
    if (settings.mode === 'toggle') {
      if (active) deactivate();
      else activate();
      return;
    }

    held = true;
    activate();
  }

  function onKeyUp(event) {
    if (smartSelectionActive) {
      if (smartSelectionConfirming) {
        if (event.code === settings.navigationShortcut.code) consume(event);
        return;
      }
      const smartReleased = event.code === settings.navigationShortcut.code
        || requiredModifierWasReleased(event, settings.navigationShortcut);
      if (smartReleased) {
        if (event.code === settings.navigationShortcut.code) consume(event);
        stopSmartSelectionMode(true);
        return;
      }
    }
    if (navigationHeld) {
      const mainReleased = event.code === settings.navigationShortcut.code;
      if (mainReleased || requiredModifierWasReleased(event, settings.navigationShortcut)) {
        if (mainReleased) consume(event);
        stopNavigation();
        return;
      }
    }
    if (settings.areaMode === 'separate' && event.code === settings.areaShortcut.code) {
      consume(event);
      return;
    }
    if (settings.areaMode === 'shared' && sharedShortcutDown) {
      const mainReleased = event.code === settings.shortcut.code;
      if (!mainReleased && !requiredModifierWasReleased(event, settings.shortcut)) return;
      if (mainReleased) consume(event);
      window.clearTimeout(sharedHoldTimer);
      sharedShortcutDown = false;
      if (sharedDismissedOnDown || sharedHoldTriggered) {
        sharedDismissedOnDown = false;
        return;
      }
      // A short press is the normal toggle action. A long press enters area
      // selection and is intentionally latched until the next shortcut press.
      if (active) deactivate();
      else activate();
      return;
    }

    if (settings.areaMode === 'shared' || settings.mode !== 'hold' || !held) return;
    const mainKeyReleased = event.code === settings.shortcut.code;
    if (!mainKeyReleased && !requiredModifierWasReleased(event, settings.shortcut)) return;

    if (mainKeyReleased) consume(event);
    held = false;
    deactivate();
  }

  function onMouseShortcutDown(event) {
    if (previewActive) return;

    if (smartSelectionActive) {
      consume(event);
      if (event.button === 0 && event.button !== smartTriggerMouseButton) confirmSmartSelection();
      return;
    }

    if (selectionActive) {
      if (mouseShortcutMatches(event, settings.navigationShortcut)) {
        consume(event);
        startSmartSelectionMode(event.button);
      }
      return;
    }

    if (navigationActive && event.button === 0) {
      consume(event);
      beginNavigationDrag(event);
      return;
    }

    if (active && mouseShortcutMatches(event, settings.navigationShortcut)) {
      consume(event);
      navigationHeld = true;
      startNavigation();
      if (event.button === 0) beginNavigationDrag(event);
      return;
    }

    if (settings.areaMode === 'separate' && mouseShortcutMatches(event, settings.areaShortcut)) {
      consume(event);
      toggleAreaTool();
      return;
    }

    if (!mouseShortcutMatches(event, settings.shortcut)) return;
    consume(event);
    if (settings.areaMode === 'shared') {
      window.clearTimeout(sharedHoldTimer);
      sharedShortcutDown = true;
      sharedHoldTriggered = false;
      sharedDismissedOnDown = false;
      if (areaZoomLatched || active) {
        deactivate();
        sharedDismissedOnDown = true;
        return;
      }
      sharedHoldTimer = window.setTimeout(() => {
        if (!sharedShortcutDown || sharedDismissedOnDown) return;
        sharedHoldTriggered = true;
        startAreaSelection();
      }, settings.areaHoldDelay);
      return;
    }

    if (areaZoomLatched) {
      deactivate();
      return;
    }
    if (settings.mode === 'toggle') {
      if (active) deactivate();
      else activate();
    } else {
      held = true;
      activate();
    }
  }

  function onMouseShortcutUp(event) {
    if (smartSelectionActive) {
      consume(event);
      if (smartSelectionConfirming) return;
      if (smartTriggerMouseButton !== null && event.button === smartTriggerMouseButton) {
        stopSmartSelectionMode(true);
      }
      return;
    }
    if (navigationSuppressPointerUp && event.button === 0) {
      navigationSuppressPointerUp = false;
      consume(event);
      return;
    }
    if (navigationDragging && event.button === 0) {
      consume(event);
      endNavigationDrag(event);
      if (navigationHeld && settings.navigationShortcut.mouseButton === 0) stopNavigation();
      return;
    }
    if (navigationHeld
        && Number.isInteger(settings.navigationShortcut.mouseButton)
        && event.button === settings.navigationShortcut.mouseButton) {
      consume(event);
      stopNavigation();
      return;
    }
    if (settings.areaMode === 'separate' && Number.isInteger(settings.areaShortcut.mouseButton)
        && event.button === settings.areaShortcut.mouseButton) {
      consume(event);
      return;
    }
    if (settings.areaMode === 'shared' && sharedShortcutDown
        && Number.isInteger(settings.shortcut.mouseButton)
        && event.button === settings.shortcut.mouseButton) {
      consume(event);
      window.clearTimeout(sharedHoldTimer);
      sharedShortcutDown = false;
      if (sharedDismissedOnDown || sharedHoldTriggered) {
        sharedDismissedOnDown = false;
        return;
      }
      if (active) deactivate();
      else activate();
      return;
    }
    if (settings.areaMode !== 'shared' && settings.mode === 'hold' && held
        && Number.isInteger(settings.shortcut.mouseButton)
        && event.button === settings.shortcut.mouseButton) {
      consume(event);
      held = false;
      deactivate();
    }
  }

  function onPointerMove(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    lastPointerTarget = event.target instanceof Element ? event.target : document.documentElement;

    if (smartSelectionActive) {
      lastPointer = { clientX: event.clientX, clientY: event.clientY, cursorType: 'pointer' };
      event.preventDefault();
      event.stopImmediatePropagation();
      updateSmartTarget(event.target);
      return;
    }

    if (navigationActive) {
      lastPointer = {
        clientX: event.clientX,
        clientY: event.clientY,
        cursorType: navigationDragging ? 'grabbing' : 'grab'
      };
      hideCursorOnElement(lastPointerTarget);
      if (effectsCursorAnchor) {
        effectsCursorAnchor.style.setProperty('--cursor-x', `${event.clientX}px`);
        effectsCursorAnchor.style.setProperty('--cursor-y', `${event.clientY}px`);
      }
      if (effectsHost) {
        effectsHost.style.setProperty('--vignette-x', `${event.clientX}px`);
        effectsHost.style.setProperty('--vignette-y', `${event.clientY}px`);
      }
      if (navigationDragging) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updateNavigationDrag(event);
      }
      return;
    }

    if (!customCursorActive && !active) {
      lastPointer.clientX = event.clientX;
      lastPointer.clientY = event.clientY;
      return;
    }
    const cursorType = customCursorActive && lastPointerTarget === hiddenCursorElement
      ? lastPointer.cursorType
      : cursorKindFromTarget(event.target);
    lastPointer.clientX = event.clientX;
    lastPointer.clientY = event.clientY;
    lastPointer.cursorType = cursorType;
    if (customCursorActive) {
      hideCursorOnElement(lastPointerTarget);
      if (!cursorMoveFrame) {
        cursorMoveFrame = requestAnimationFrame(() => {
          cursorMoveFrame = 0;
          if (customCursorActive) updateCustomCursorPosition();
        });
      }
    }
  }

  function releaseHoldIfFocusIsLost() {
    window.clearTimeout(sharedHoldTimer);
    sharedShortcutDown = false;
    if (navigationHeld) stopNavigation();
    if (settings.areaMode === 'shared') return;
    if (settings.mode !== 'hold' || !held) return;
    held = false;
    deactivate();
  }

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onMouseShortcutDown, true);
  window.addEventListener('pointerup', onMouseShortcutUp, true);
  window.addEventListener('contextmenu', (event) => {
    const rightButtonUsed = [settings.shortcut, settings.areaShortcut, settings.navigationShortcut]
      .some((shortcut) => shortcut.mouseButton === 2);
    if (rightButtonUsed) consume(event);
  }, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('wheel', (event) => {
    if (!smartSelectionActive || smartSelectionConfirming) return;
    consume(event);
    cycleSmartSelection(event.deltaY < 0 ? 1 : -1);
  }, { capture: true, passive: false });
  document.addEventListener('toggle', (event) => queueFloatingCandidates([event.target]), true);
  window.addEventListener('click', (event) => {
    if (smartSelectionActive) {
      consume(event);
      return;
    }
    if (!navigationSuppressClick) return;
    navigationSuppressClick = false;
    consume(event);
  }, true);
  document.addEventListener('click', () => {
    if (!active) return;
    const selector = '[role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"], [popover], dialog, [data-radix-popper-content-wrapper]';
    window.setTimeout(() => { if (active) queueFloatingCandidates(document.querySelectorAll(selector)); }, 40);
    window.setTimeout(() => { if (active) queueFloatingCandidates(document.querySelectorAll(selector)); }, 180);
  }, true);
  window.addEventListener('blur', releaseHoldIfFocusIsLost, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseHoldIfFocusIsLost();
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'scz-preview-start') {
      startLivePreview(message.settings);
      sendResponse({ ok: true });
    } else if (message.type === 'scz-preview-update') {
      updateLivePreview(message.settings);
      sendResponse({ ok: true });
    } else if (message.type === 'scz-preview-stop') {
      stopLivePreview();
      sendResponse({ ok: true });
    } else if (message.type === 'scz-area-select-start') {
      if (previewActive) stopLivePreview();
      settings = storedSettings;
      toggleAreaTool();
      sendResponse({ ok: true });
    }
  });

  const siteProfileKey = location.hostname || 'local-file';
  chrome.storage.sync.get(['mfzSettings', 'mfzSiteProfiles']).then(({ mfzSettings, mfzSiteProfiles }) => {
    storedSettings = sanitizeSettings(mfzSettings || DEFAULT_SETTINGS);
    siteProfiles = mfzSiteProfiles && typeof mfzSiteProfiles === 'object' ? mfzSiteProfiles : {};
    siteProfile = sanitizeSiteProfile(siteProfiles[siteProfileKey]);
    if (!previewActive) settings = storedSettings;
  }).catch(() => {
    storedSettings = sanitizeSettings(DEFAULT_SETTINGS);
    siteProfiles = {};
    siteProfile = { ...DEFAULT_SITE_PROFILE };
    if (!previewActive) settings = storedSettings;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    const settingsChanged = Boolean(changes.mfzSettings);
    const profilesChanged = Boolean(changes.mfzSiteProfiles);
    if (!settingsChanged && !profilesChanged) return;

    const wasActive = active || Boolean(savedInlineStyles);
    if (profilesChanged && wasActive) forceResetZoom();
    else if (settingsChanged && wasActive && !previewActive) deactivate();
    held = false;
    if (settingsChanged) {
      storedSettings = sanitizeSettings(changes.mfzSettings.newValue || DEFAULT_SETTINGS);
      if (!previewActive) settings = storedSettings;
    }
    if (profilesChanged) {
      siteProfiles = changes.mfzSiteProfiles.newValue && typeof changes.mfzSiteProfiles.newValue === 'object'
        ? changes.mfzSiteProfiles.newValue : {};
      siteProfile = sanitizeSiteProfile(siteProfiles[siteProfileKey]);
      managedZoomElement = null;
    }
    if (previewActive && profilesChanged) activate();
    else if (!previewActive) syncEffectsSettings();
  });

})();
