// 状态
let currentTab = 'all';
let currentFilterDays = 3;
let searchKeyword = '';
let items = [];

// DOM 元素
const contentList = document.getElementById('contentList');
const searchInput = document.getElementById('searchInput');
const dateFilter = document.getElementById('dateFilter');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const retentionDays = document.getElementById('retentionDays');
const autoStart = document.getElementById('autoStart');

// 初始化
async function init() {
  try {
    await loadSettings();
    await loadItems();
    setupEventListeners();
  } catch (err) {
    console.error('初始化失败:', err);
  }
}

// 加载所有条目
async function loadItems() {
  try {
    const filter = {
      type: currentTab === 'all' ? null : currentTab,
      days: currentFilterDays,
      keyword: searchKeyword
    };

    items = await window.electronAPI.getItems(filter);
    renderItems();
  } catch (err) {
    console.error('加载失败:', err);
  }
}

// 加载设置
async function loadSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    if (settings) {
      retentionDays.value = settings.retentionDays || 3;
      autoStart.checked = settings.autoStart || false;
      currentFilterDays = settings.retentionDays || 3;
      dateFilter.value = currentFilterDays;
    }
  } catch (err) {
    console.error('加载设置失败:', err);
  }
}

// 保存设置
async function saveSettings() {
  try {
    const settings = {
      retentionDays: parseInt(retentionDays.value),
      autoStart: autoStart.checked
    };
    await window.electronAPI.saveSettings(settings);
    currentFilterDays = settings.retentionDays;
    dateFilter.value = currentFilterDays;
    await loadItems();
    closeModal();
  } catch (err) {
    console.error('保存设置失败:', err);
  }
}

// 置顶/取消置顶
async function togglePin(id) {
  try {
    console.log('togglePin called, id:', id, 'items count:', items.length);
    const item = items.find(i => i.id === id);
    console.log('Found item:', item);
    if (!item) {
      console.log('Item not found!');
      // 强制刷新列表
      await loadItems();
      return;
    }
    if (item.is_pinned) {
      console.log('Calling unpinItem');
      await window.electronAPI.unpinItem(id);
    } else {
      console.log('Calling pinItem');
      await window.electronAPI.pinItem(id);
    }
    console.log('Reloading items');
    await loadItems();
    console.log('After reload, items count:', items.length);
  } catch (err) {
    console.error('置顶失败:', err);
  }
}

// 删除
async function deleteItem(id) {
  try {
    console.log('deleteItem called, id:', id);
    console.log('Current items:', items.map(i => ({id: i.id, type: i.type})));
    const result = await window.electronAPI.deleteItem(id);
    console.log('Delete result:', result);
    await loadItems();
  } catch (err) {
    console.error('删除失败:', err);
  }
}

// 复制到剪贴板
async function copyToClipboard(id) {
  try {
    const item = items.find(i => i.id === id);
    if (item) {
      await window.electronAPI.copyToClipboard(item.type, item.content);
    }
  } catch (err) {
    console.error('复制失败:', err);
  }
}

// 静默复制（不产生新记录）
async function silentCopyItem(id) {
  try {
    const item = items.find(i => i.id === id);
    if (item) {
      await window.electronAPI.copyToClipboard(item.type, item.content);
    }
  } catch (err) {
    console.error('复制失败:', err);
  }
}

// 渲染列表
function renderItems() {
  // 过滤
  let filtered = [...items];

  if (currentTab !== 'all') {
    filtered = filtered.filter(item => item.type === currentTab);
  }

  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    filtered = filtered.filter(item =>
      item.type === 'text' && item.content.toLowerCase().includes(kw)
    );
  }

  // 排序：置顶优先，然后按时间降序
  filtered.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return b.is_pinned - a.is_pinned;
    }
    return b.created_at - a.created_at;
  });

  if (filtered.length === 0) {
    contentList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path fill="#ccc" d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/>
        </svg>
        <p>暂无剪贴板记录</p>
        <p class="hint">复制内容后会自动显示在这里</p>
      </div>
    `;
    return;
  }

  contentList.innerHTML = filtered.map(item => {
    const time = formatTime(item.created_at);
    const pinnedClass = item.is_pinned ? 'pinned' : '';
    const pinBtnClass = item.is_pinned ? 'active' : '';

    if (item.type === 'text') {
      return `
        <div class="item-card ${pinnedClass}" data-id="${item.id}" ondblclick="handleDoubleClick(${item.id})">
          <div class="item-header">
            <span class="item-type">
              <svg viewBox="0 0 24 24"><path fill="#4A90D9" d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z"/></svg>
              文字
            </span>
            <span class="item-time">${time}</span>
          </div>
          <div class="item-content">${escapeHtml(item.content)}</div>
          <div class="item-actions">
            <button class="action-btn copy-btn" data-action="silent-copy" data-id="${item.id}">复制</button>
            <button class="action-btn pin-btn ${pinBtnClass}" data-action="pin" data-id="${item.id}">
              ${item.is_pinned ? '取消置顶' : '置顶'}
            </button>
            <button class="action-btn delete-btn" data-action="delete" data-id="${item.id}">删除</button>
          </div>
        </div>
      `;
    } else if (item.type === 'image') {
      return `
        <div class="item-card ${pinnedClass}" data-id="${item.id}" ondblclick="handleDoubleClick(${item.id})">
          <div class="item-header">
            <span class="item-type">
              <svg viewBox="0 0 24 24"><path fill="#4A90D9" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
              图片
            </span>
            <span class="item-time">${time}</span>
          </div>
          <div class="item-content image-content">
            <img src="file:///${item.content.replace(/\\/g, '/')}" alt="图片">
          </div>
          <div class="item-actions">
            <button class="action-btn copy-btn" data-action="silent-copy" data-id="${item.id}">复制</button>
            <button class="action-btn pin-btn ${pinBtnClass}" data-action="pin" data-id="${item.id}">
              ${item.is_pinned ? '取消置顶' : '置顶'}
            </button>
            <button class="action-btn delete-btn" data-action="delete" data-id="${item.id}">删除</button>
          </div>
        </div>
      `;
    } else if (item.type === 'file') {
      const fileName = item.content.split(/[/\\]/).pop();
      const fileExt = fileName.split('.').pop().toLowerCase();
      return `
        <div class="item-card ${pinnedClass}" data-id="${item.id}" ondblclick="handleDoubleClick(${item.id})">
          <div class="item-header">
            <span class="item-type">
              <svg viewBox="0 0 24 24"><path fill="#4A90D9" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
              文件
            </span>
            <span class="item-time">${time}</span>
          </div>
          <div class="item-content file-content">
            <div class="file-icon">${getFileIcon(fileExt)}</div>
            <div class="file-info">
              <div class="file-name">${escapeHtml(fileName)}</div>
              <div class="file-path">${escapeHtml(item.content)}</div>
            </div>
          </div>
          <div class="item-actions">
            <button class="action-btn copy-btn" data-action="silent-copy" data-id="${item.id}">复制</button>
            <button class="action-btn pin-btn ${pinBtnClass}" data-action="pin" data-id="${item.id}">
              ${item.is_pinned ? '取消置顶' : '置顶'}
            </button>
            <button class="action-btn delete-btn" data-action="delete" data-id="${item.id}">删除</button>
          </div>
        </div>
      `;
    }
  }).join('');
}

// 双击复制
async function handleDoubleClick(id) {
  await copyToClipboard(id);
}

// 时间格式化
function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return Math.floor(diff / minute) + ' 分钟前';
  if (diff < day) return Math.floor(diff / hour) + ' 小时前';
  if (diff < 7 * day) return Math.floor(diff / day) + ' 天前';

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 获取文件类型图标
function getFileIcon(ext) {
  const iconMap = {
    // 文档
    pdf: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#E53935" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#2196F3" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    docx: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#2196F3" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    xls: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#4CAF50" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    xlsx: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#4CAF50" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    ppt: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#FF5722" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    pptx: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#FF5722" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    txt: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#757575" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    // 压缩文件
    zip: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#FF9800" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>',
    rar: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#FF9800" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>',
    // 音视频
    mp3: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#9C27B0" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
    mp4: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#E91E63" d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>',
    // 图片
    jpg: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#4CAF50" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    png: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#4CAF50" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    gif: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#4CAF50" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    // 代码
    js: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#FFEB3B" d="M3 3h18v18H3V3zm16.525 13.707c-.131-.821-.666-1.511-2.252-2.155-.552-.259-1.165-.438-1.349-.854-.068-.248-.078-.382-.034-.529.113-.484.687-.629 1.137-.495.293.09.563.315.732.676.775-.507.775-.507 1.316-.844-.203-.314-.311-.449-.439-.548a3.67 3.67 0 0 0-.439-.548c-.293-.293-.635-.476-1.019-.601-.667-.277-1.682-.202-2.254.439-.293.293-.483.686-.641 1.106-.203.528-.146 1.057.146 1.439.264.364.686.506 1.103.439.374-.059.724-.316.935-.702l1.156.641c-.146.203-.27.427-.439.602-.425.44-.971.693-1.666.693-.846 0-1.538-.356-2.001-1.017-.576-.825-.658-2.074-.18-3.088.602-.809 1.718-1.28 2.756-1.28.846 0 1.538.356 2.001 1.017.239.374.35.808.293 1.224l-2.001-.697zM9.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
    html: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#FF5722" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    css: '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#2196F3" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
  };

  return iconMap[ext] || '<svg viewBox="0 0 24 24" width="32" height="32"><path fill="#757575" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
}

// 打开设置弹窗
function openModal() {
  settingsModal.classList.add('show');
}

// 关闭设置弹窗
function closeModal() {
  settingsModal.classList.remove('show');
}

// 事件监听
function setupEventListeners() {
  // Tab 切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      loadItems();
    });
  });

  // 搜索
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchKeyword = searchInput.value.trim();
      loadItems();
    }, 300);
  });

  // 日期过滤
  dateFilter.addEventListener('change', () => {
    currentFilterDays = parseInt(dateFilter.value);
    loadItems();
  });

  // 设置弹窗
  settingsBtn.addEventListener('click', openModal);
  closeSettingsBtn.addEventListener('click', closeModal);
  saveSettingsBtn.addEventListener('click', saveSettings);

  // 点击弹窗背景关闭
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeModal();
  });

  // 剪贴板变化监听
  window.electronAPI.onClipboardChange((data) => {
    loadItems();
  });

  // 按钮点击事件委托
  contentList.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);

    if (action === 'pin') {
      togglePin(id);
    } else if (action === 'delete') {
      deleteItem(id);
    } else if (action === 'silent-copy') {
      silentCopyItem(id);
    }
  });
}

// 启动
init();