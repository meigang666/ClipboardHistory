# ClipboardHistory 开发标准

## 项目信息

| 项目 | 内容 |
|------|------|
| 项目名称 | ClipboardHistory |
| 类型 | Windows 桌面应用 |
| 技术栈 | Electron 32.x + HTML/CSS/JS + SQLite |
| 数据存储 | D:\ClipboardHistory\ |

## 项目结构

```
vibecoding-project/
├── logs/                    # 开发日志目录
│   └── YYYY-MM-DD.md        # 每日日志
├── docs/                    # 项目文档目录
│   ├── README.md           # 开发标准（本文档）
│   └── SPEC.md             # 功能规格说明书
├── src/                     # 源代码
│   ├── main/               # 主进程
│   │   ├── main.js        # Electron 主进程
│   │   └── clipboard.js   # 剪贴板监控
│   ├── renderer/          # 渲染进程
│   │   ├── index.html     # 主页面
│   │   ├── styles.css    # 样式
│   │   └── renderer.js    # 前端逻辑
│   └── preload.js         # 预加载脚本
├── images/                 # 图片存储（运行时创建）
├── db/                     # 数据库目录（运行时创建）
├── package.json
└── electron-builder.yml
```

## 环境要求

- Node.js 20.x+
- npm 10.x+
- Windows 10/11

## 开发命令

```bash
# 安装依赖
npm install

# 开发运行
npm run dev

# 打包
npm run build
```

## 数据存储规范

所有数据必须存储在 `D:\ClipboardHistory\` 目录下：

```
D:\ClipboardHistory\
├── images\         # 图片原文件
│   └── {uuid}.png
├── db\            # SQLite 数据库
│   └── clipboard.db
└── logs\          # 应用运行日志（可选）
```

## 代码规范

1. **主进程 (main.js)**: 处理系统集成、窗口管理、剪贴板监控
2. **预加载 (preload.js)**: 安全桥接主进程和渲染进程
3. **渲染进程**: 纯 UI 逻辑，不直接访问系统 API
4. **数据库**: 使用 better-sqlite3，同步 API

## 开发阶段

1. 阶段一：Electron 基础搭建
2. 阶段二：数据库与存储
3. 阶段三：剪贴板监控
4. 阶段四：UI 开发
5. 阶段五：功能实现
6. 阶段六：系统集成
7. 阶段七：打包发布

每个阶段完成后需更新日志并验证功能。