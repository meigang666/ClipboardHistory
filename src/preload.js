const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 数据路径
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  getImagesPath: () => ipcRenderer.invoke('get-images-path'),
  getDbPath: () => ipcRenderer.invoke('get-db-path'),

  // 剪贴板监控事件
  onClipboardChange: (callback) => {
    ipcRenderer.on('clipboard-change', (event, data) => callback(data));
  },

  // 获取列表
  getItems: (filter) => ipcRenderer.invoke('get-items', filter),

  // 置顶
  pinItem: (id) => ipcRenderer.invoke('pin-item', id),

  // 取消置顶
  unpinItem: (id) => ipcRenderer.invoke('unpin-item', id),

  // 删除
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),

  // 复制到剪贴板
  copyToClipboard: (type, content) => ipcRenderer.invoke('copy-to-clipboard', type, content),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
});