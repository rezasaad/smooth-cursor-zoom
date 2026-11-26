'use strict';

importScripts('shared/settings.js');

const { DEFAULT_SETTINGS } = globalThis.SCZSettings;

chrome.runtime.onInstalled.addListener(async () => {
  const { mfzSettings } = await chrome.storage.sync.get('mfzSettings');
  if (!mfzSettings) {
    await chrome.storage.sync.set({ mfzSettings: DEFAULT_SETTINGS });
  }
});

// A popup is short-lived. The port lets the service worker reliably tell the
// page to leave preview mode when the popup closes, even if pagehide is skipped.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'start-area-selection') return;
  const { mfzSettings } = await chrome.storage.sync.get('mfzSettings');
  const current = mfzSettings || DEFAULT_SETTINGS;
  const areaShortcut = current.areaShortcut || DEFAULT_SETTINGS.areaShortcut;
  const usesDefaultAreaShortcut = !Number.isInteger(areaShortcut.mouseButton)
    && areaShortcut.code === 'KeyX'
    && !areaShortcut.ctrl && areaShortcut.alt && areaShortcut.shift && !areaShortcut.meta;
  if ((current.areaMode || DEFAULT_SETTINGS.areaMode) !== 'separate' || !usesDefaultAreaShortcut) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab && Number.isInteger(tab.id)) {
    chrome.tabs.sendMessage(tab.id, { type: 'scz-area-select-start' }).catch(() => {});
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'scz-live-preview') return;
  let previewTabId = null;

  port.onMessage.addListener((message) => {
    if (message && message.type === 'bind-preview-tab' && Number.isInteger(message.tabId)) {
      previewTabId = message.tabId;
    }
  });

  port.onDisconnect.addListener(() => {
    if (!Number.isInteger(previewTabId)) return;
    chrome.tabs.sendMessage(previewTabId, { type: 'scz-preview-stop' }).catch(() => {});
  });
});
