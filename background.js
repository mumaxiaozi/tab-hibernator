// Tab Hibernator - Background Service Worker
// 追踪 Tab 活跃度，定时休眠不活跃标签页

const DEFAULT_THRESHOLD = 15; // 默认 15 分钟
const CHECK_INTERVAL = 1;    // 每 1 分钟检查一次

// 内置不可休眠的前缀
const PROTECTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
];

// ==================== 活跃度追踪 ====================

// 记录 Tab 最后访问时间
async function recordAccess(tabId) {
  const data = await chrome.storage.local.get('lastAccessMap');
  const map = data.lastAccessMap || {};
  map[tabId] = Date.now();
  await chrome.storage.local.set({ lastAccessMap: map });
}

// Tab 切换时记录
chrome.tabs.onActivated.addListener((activeInfo) => {
  recordAccess(activeInfo.tabId);
});

// Tab URL 更新时记录
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    recordAccess(tabId);
  }
});

// Tab 关闭时清理记录
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get('lastAccessMap');
  const map = data.lastAccessMap || {};
  delete map[tabId];
  await chrome.storage.local.set({ lastAccessMap: map });
});

// 补录新出现的 Tab（不覆盖已有时间戳）
async function initializeAccessTimes() {
  const tabs = await chrome.tabs.query({});
  const data = await chrome.storage.local.get('lastAccessMap');
  const map = data.lastAccessMap || {};
  const now = Date.now();
  for (const tab of tabs) {
    if (!map[tab.id]) {
      // 只有没记录的 tab 才初始化，活跃 Tab 记当前时间，非活跃记稍早时间
      map[tab.id] = tab.active ? now : now - 60000;
    }
  }
  // 清理已关闭 tab 的残留记录
  const activeIds = new Set(tabs.map(t => t.id));
  for (const id of Object.keys(map)) {
    if (!activeIds.has(Number(id))) {
      delete map[id];
    }
  }
  await chrome.storage.local.set({ lastAccessMap: map });
}

// ==================== 白名单 ====================

async function getWhitelist() {
  const data = await chrome.storage.sync.get('whitelist');
  return data.whitelist || [];
}

function isProtectedUrl(url) {
  if (!url) return true;
  return PROTECTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function isWhitelisted(url) {
  if (isProtectedUrl(url)) return true;
  const whitelist = await getWhitelist();
  if (whitelist.length === 0) return false;
  try {
    const hostname = new URL(url).hostname;
    return whitelist.some(pattern => {
      // 支持精确匹配和域名后缀匹配
      if (pattern.startsWith('.')) {
        return hostname.endsWith(pattern) || hostname === pattern.slice(1);
      }
      return hostname === pattern || hostname.endsWith('.' + pattern);
    });
  } catch {
    return false;
  }
}

// ==================== 自动休眠 ====================

function shouldSkipTab(tab) {
  // 跳过当前活跃 Tab
  if (tab.active) return true;
  // 跳过固定的 Tab
  if (tab.pinned) return true;
  // 跳过正在播放音频的 Tab
  if (tab.audible) return true;
  // 跳过已休眠的 Tab
  if (tab.discarded) return true;
  // 跳过 chrome:// 等内部页面
  if (isProtectedUrl(tab.url)) return true;
  return false;
}

async function checkAndDiscard() {
  // 获取用户设置的阈值
  const settings = await chrome.storage.sync.get('threshold');
  const threshold = (settings.threshold || DEFAULT_THRESHOLD) * 60 * 1000; // 转为毫秒

  const data = await chrome.storage.local.get('lastAccessMap');
  const map = data.lastAccessMap || {};
  const now = Date.now();

  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (shouldSkipTab(tab)) continue;

    // 检查白名单
    if (await isWhitelisted(tab.url)) continue;

    const lastAccess = map[tab.id];
    if (!lastAccess) {
      // 没有记录，记录当前时间，跳过本次
      await recordAccess(tab.id);
      continue;
    }

    if (now - lastAccess > threshold) {
      try {
        await chrome.tabs.discard(tab.id);
      } catch (e) {
        // discard 可能失败（如 tab 刚被激活），忽略
        console.warn(`Failed to discard tab ${tab.id}:`, e.message);
      }
    }
  }
}

// ==================== Alarm 定时器 ====================

chrome.alarms.create('check-tabs', {
  periodInMinutes: CHECK_INTERVAL,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-tabs') {
    checkAndDiscard();
  }
});

// ==================== 消息处理（供 Popup 调用）====================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'discard-all') {
    discardAllInactive().then(result => sendResponse(result));
    return true; // 异步响应
  }
  if (msg.action === 'discard-tab') {
    chrome.tabs.discard(msg.tabId).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.action === 'reload-tab') {
    chrome.tabs.reload(msg.tabId).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.action === 'get-access-map') {
    chrome.storage.local.get('lastAccessMap').then(data => sendResponse(data.lastAccessMap || {}));
    return true;
  }
});

// 一键休眠所有不活跃 Tab（不管是否超阈值，手动操作直接休眠）
async function discardAllInactive() {
  const tabs = await chrome.tabs.query({});
  let count = 0;
  const errors = [];

  for (const tab of tabs) {
    if (tab.active) continue;
    if (tab.pinned) continue;
    if (tab.audible) continue;
    if (tab.discarded) continue;
    if (isProtectedUrl(tab.url)) continue;
    if (await isWhitelisted(tab.url)) continue;

    try {
      await chrome.tabs.discard(tab.id);
      count++;
    } catch (e) {
      errors.push({ tabId: tab.id, error: e.message });
    }
  }

  return { count, errors };
}

// ==================== 初始化 ====================

chrome.runtime.onInstalled.addListener(() => {
  initializeAccessTimes();
  // 设置默认阈值（如果未设置过）
  chrome.storage.sync.get('threshold').then(data => {
    if (data.threshold === undefined) {
      chrome.storage.sync.set({ threshold: DEFAULT_THRESHOLD });
    }
  });
  // 设置默认白名单
  chrome.storage.sync.get('whitelist').then(data => {
    if (!data.whitelist) {
      chrome.storage.sync.set({ whitelist: [] });
    }
  });
});

// Service Worker 启动时也初始化
initializeAccessTimes();
