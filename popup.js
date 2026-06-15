// Tab Hibernator - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
});

// ==================== 初始化 ====================

async function initPopup() {
  await loadSettings();
  await loadWhitelist();
  await refreshTabList();
  bindEvents();
}

// ==================== 事件绑定 ====================

function bindEvents() {
  // 一键休眠全部
  document.getElementById('btn-discard-all').addEventListener('click', discardAll);

  // 唤醒全部
  document.getElementById('btn-reload-all').addEventListener('click', reloadAll);

  // 阈值变更
  document.getElementById('threshold').addEventListener('change', saveThreshold);

  // 添加白名单
  document.getElementById('btn-add-whitelist').addEventListener('click', addWhitelist);
  document.getElementById('whitelist-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelist();
  });
}

// ==================== 设置 ====================

async function loadSettings() {
  const data = await chrome.storage.sync.get('threshold');
  const threshold = data.threshold || 15;
  document.getElementById('threshold').value = String(threshold);
}

async function saveThreshold() {
  const value = parseInt(document.getElementById('threshold').value, 10);
  await chrome.storage.sync.set({ threshold: value });
  showToast(`已设置：${value} 分钟无活动后休眠`);
}

// ==================== 白名单 ====================

async function loadWhitelist() {
  const data = await chrome.storage.sync.get('whitelist');
  const whitelist = data.whitelist || [];
  renderWhitelist(whitelist);
}

function renderWhitelist(whitelist) {
  const container = document.getElementById('whitelist-tags');
  if (whitelist.length === 0) {
    container.innerHTML = '<span style="font-size:11px;color:#94a3b8;">暂无白名单域名</span>';
    return;
  }
  container.innerHTML = whitelist.map(domain => `
    <span class="whitelist-tag">
      ${escapeHtml(domain)}
      <span class="remove-tag" data-domain="${escapeHtml(domain)}">×</span>
    </span>
  `).join('');

  // 绑定删除事件
  container.querySelectorAll('.remove-tag').forEach(el => {
    el.addEventListener('click', () => removeWhitelist(el.dataset.domain));
  });
}

async function addWhitelist() {
  const input = document.getElementById('whitelist-input');
  let domain = input.value.trim().toLowerCase();

  if (!domain) return;

  // 清理 URL，只保留域名
  try {
    if (domain.includes('://')) {
      domain = new URL(domain).hostname;
    } else if (domain.includes('/')) {
      domain = domain.split('/')[0];
    }
  } catch {
    // 不是有效 URL，就当域名处理
  }

  // 去重
  if (!domain || domain.length < 2) {
    showToast('请输入有效的域名');
    return;
  }

  const data = await chrome.storage.sync.get('whitelist');
  const whitelist = data.whitelist || [];

  if (whitelist.includes(domain)) {
    showToast('该域名已在白名单中');
    return;
  }

  whitelist.push(domain);
  await chrome.storage.sync.set({ whitelist });

  input.value = '';
  renderWhitelist(whitelist);
  showToast(`已添加白名单：${domain}`);
}

async function removeWhitelist(domain) {
  const data = await chrome.storage.sync.get('whitelist');
  const whitelist = (data.whitelist || []).filter(d => d !== domain);
  await chrome.storage.sync.set({ whitelist });
  renderWhitelist(whitelist);
  showToast(`已移除：${domain}`);
}

// ==================== Tab 列表 ====================

async function refreshTabList() {
  const tabs = await chrome.tabs.query({});
  const accessMap = await chrome.runtime.sendMessage({ action: 'get-access-map' });
  const data = await chrome.storage.sync.get('threshold');
  const threshold = (data.threshold || 15) * 60 * 1000;

  // 统计
  const totalTabs = tabs.length;
  const activeTabs = tabs.filter(t => t.active).length;
  const discardedTabs = tabs.filter(t => t.discarded).length;

  document.getElementById('total-tabs').textContent = totalTabs;
  document.getElementById('active-tabs').textContent = activeTabs;
  document.getElementById('discarded-tabs').textContent = discardedTabs;
  document.getElementById('tab-count-label').textContent = `${totalTabs} 个`;

  // 获取系统可用内存
  try {
    if (chrome.system && chrome.system.memory) {
      const memInfo = await chrome.system.memory.getInfo();
      const available = memInfo.availableCapacity;
      const total = memInfo.capacity;
      const pct = Math.round((available / total) * 100);
      document.getElementById('total-memory').textContent = `${formatBytes(available)} (${pct}%)`;
    } else {
      document.getElementById('total-memory').textContent = 'N/A';
    }
  } catch (e) {
    document.getElementById('total-memory').textContent = 'N/A';
  }

  // 渲染列表
  const listEl = document.getElementById('tab-list');
  const now = Date.now();

  // 按窗口分组排序
  tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
  });

  const html = tabs.map(tab => {
    let status = 'idle';
    let statusText = '空闲';

    if (tab.active) {
      status = 'active';
      statusText = '活跃';
    } else if (tab.discarded) {
      status = 'discarded';
      statusText = '已休眠';
    } else {
      const lastAccess = accessMap[tab.id];
      if (lastAccess && now - lastAccess > threshold) {
        status = 'idle';
        statusText = '待休眠';
      }
    }

    const favicon = tab.favIconUrl || getDefaultFavicon();
    const hostname = getHostname(tab.url);
    const lastAccessTime = accessMap[tab.id] ? formatTimeAgo(accessMap[tab.id], now) : '未知';

    return `
      <div class="tab-item ${tab.discarded ? 'is-discarded' : ''} ${tab.active ? 'is-active' : ''}" data-tab-id="${tab.id}">
        <img class="tab-favicon" src="${escapeHtml(favicon)}" onerror="this.src='${getDefaultFavicon()}'">
        <div class="tab-info">
          <div class="tab-title" title="${escapeHtml(tab.title || '')}">${escapeHtml(tab.title || '无标题')}</div>
          <div class="tab-url">${escapeHtml(hostname)} · ${lastAccessTime}</div>
        </div>
        <div class="tab-meta">
          <span class="tab-status ${status}">${statusText}</span>
          <div class="tab-actions">
            ${!tab.discarded && !tab.active
              ? `<button class="tab-btn discard-btn" data-action="discard" data-tab-id="${tab.id}" title="休眠此标签">⏸</button>`
              : ''}
            ${tab.discarded
              ? `<button class="tab-btn reload-btn" data-action="reload" data-tab-id="${tab.id}" title="唤醒此标签">▶</button>`
              : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html || '<div class="loading">暂无标签页</div>';

  // 绑定单个 Tab 操作按钮
  listEl.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId, 10);
      if (btn.dataset.action === 'discard') {
        chrome.runtime.sendMessage({ action: 'discard-tab', tabId }, (resp) => {
          if (resp?.ok) {
            showToast('已休眠该标签页');
            refreshTabList();
          }
        });
      } else if (btn.dataset.action === 'reload') {
        chrome.runtime.sendMessage({ action: 'reload-tab', tabId }, (resp) => {
          if (resp?.ok) {
            showToast('已唤醒该标签页');
            refreshTabList();
          }
        });
      }
    });
  });
}

// ==================== 批量操作 ====================

async function discardAll() {
  const btn = document.getElementById('btn-discard-all');
  btn.disabled = true;
  btn.textContent = '休眠中...';

  try {
    const result = await chrome.runtime.sendMessage({ action: 'discard-all' });
    showToast(`已休眠 ${result.count} 个标签页`);
    await refreshTabList();
  } catch (e) {
    showToast('操作失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⏸ 一键休眠全部';
  }
}

async function reloadAll() {
  const tabs = await chrome.tabs.query({ discarded: true });
  let count = 0;
  for (const tab of tabs) {
    try {
      await chrome.runtime.sendMessage({ action: 'reload-tab', tabId: tab.id });
      count++;
    } catch {
      // 忽略失败
    }
  }
  showToast(`已唤醒 ${count} 个标签页`);
  await refreshTabList();
}

// ==================== 工具函数 ====================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTimeAgo(timestamp, now) {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function getHostname(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 30);
  }
}

function getDefaultFavicon() {
  // 一个简单的灰色圆形 SVG data URL
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="7" fill="%23cbd5e1"/>' +
    '<text x="8" y="11.5" text-anchor="middle" font-size="9" fill="white" font-family="sans-serif">T</text>' +
    '</svg>'
  );
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}
