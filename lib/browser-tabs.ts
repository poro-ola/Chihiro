import type { OpenTab } from './types';

const previewTabs: OpenTab[] = [
  {
    id: -1,
    windowId: -1,
    title: '千寻 · 标签与资料工作台',
    url: 'https://example.com/chihiro',
    active: true,
    pinned: false,
  },
  {
    id: -2,
    windowId: -1,
    title: '产品需求与交互参考',
    url: 'https://example.com/product-notes',
    active: false,
    pinned: false,
  },
  {
    id: -3,
    windowId: -1,
    title: '稍后整理的调研资料',
    url: 'https://example.com/research',
    active: false,
    pinned: false,
  },
];

function hasTabsApi() {
  return typeof browser !== 'undefined' && Boolean(browser.tabs?.query);
}

export async function queryOpenTabs(): Promise<OpenTab[]> {
  if (!hasTabsApi()) return previewTabs;
  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab): tab is typeof tab & { id: number; windowId: number } =>
      typeof tab.id === 'number' && typeof tab.windowId === 'number',
    )
    .map((tab) => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || '未命名标签',
      url: tab.url || '',
      faviconUrl: tab.favIconUrl,
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned),
    }));
}

export function subscribeToOpenTabs(callback: (tabs: OpenTab[]) => void) {
  let disposed = false;
  const refresh = async () => {
    try {
      const tabs = await queryOpenTabs();
      if (!disposed) callback(tabs);
    } catch {
      if (!disposed) callback([]);
    }
  };

  void refresh();
  if (!hasTabsApi()) return () => undefined;

  const onChanged = () => void refresh();
  browser.tabs.onCreated.addListener(onChanged);
  browser.tabs.onRemoved.addListener(onChanged);
  browser.tabs.onUpdated.addListener(onChanged);
  browser.tabs.onActivated.addListener(onChanged);
  browser.tabs.onMoved.addListener(onChanged);

  return () => {
    disposed = true;
    browser.tabs.onCreated.removeListener(onChanged);
    browser.tabs.onRemoved.removeListener(onChanged);
    browser.tabs.onUpdated.removeListener(onChanged);
    browser.tabs.onActivated.removeListener(onChanged);
    browser.tabs.onMoved.removeListener(onChanged);
  };
}

export async function activateTab(tabId: number) {
  if (tabId < 0 || !hasTabsApi()) return;
  const tab = await browser.tabs.update(tabId, { active: true });
  if (typeof tab?.windowId === 'number') await browser.windows.update(tab.windowId, { focused: true });
}

export async function closeTab(tabId: number) {
  if (tabId < 0 || !hasTabsApi()) return;
  await browser.tabs.remove(tabId);
}

export async function openBookmark(url: string) {
  if (hasTabsApi()) {
    await browser.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function openBookmarks(urls: string[]) {
  const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  let opened = 0;
  let failed = 0;

  for (const url of uniqueUrls) {
    try {
      if (hasTabsApi()) {
        await browser.tabs.create({ url, active: false });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      opened += 1;
    } catch {
      failed += 1;
    }
  }

  if (failed) {
    throw new Error(opened ? `已打开 ${opened} 个链接，另有 ${failed} 个打开失败` : '链接打开失败');
  }

  return opened;
}
