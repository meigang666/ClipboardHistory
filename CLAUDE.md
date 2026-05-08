# ClipboardHistory 开发指引

## 项目概述

Windows 桌面应用，用于记录和管理剪贴板历史。

## 标准文件路径

| 文件 | 路径 | 说明 |
|------|------|------|
| 开发标准 | [docs/README.md](docs/README.md) | 开发规范、阶段划分 |
| 功能规格 | [docs/SPEC.md](docs/SPEC.md) | 详细功能说明 |
| 开发日志 | [logs/](logs/) | 每日开发记录 |

## 快速开始

1. 查看 [docs/README.md](docs/README.md) 了解开发标准
2. 查看 [docs/SPEC.md](docs/SPEC.md) 了解功能需求
3. 安装依赖：`npm install`
4. 开发运行：`npm run dev`
5. 打包：`npm run build`

## 当前阶段

- **阶段**: 阶段一 - Electron 基础项目搭建
- **日志**: [logs/2026-05-07.md](logs/2026-05-07.md)

## 技术栈

- Electron 32.x
- better-sqlite3（数据库）
- electron-builder（打包）

## 数据存储

固定路径：`D:\ClipboardHistory\`