# 羊毛打卡管家 / Wool Check-in Manager

<p align="center">
  <a href="https://daka-uwc.pages.dev/"><strong>🌐 在线演示 Online Demo</strong></a>
  &nbsp;·&nbsp;
  <a href="#zh">中文</a>
  &nbsp;·&nbsp;
  <a href="#en">English</a>
  &nbsp;·&nbsp;
  <a href="#sponsor">☕ 支持作者</a>
</p>

<p align="center">
  <a href="https://daka-uwc.pages.dev/">https://daka-uwc.pages.dev/</a>
</p>

自用多端「羊毛 / 签到」打卡工具。数据优先保存在浏览器本地，可选同步到 Cloudflare KV。

A personal multi-device check-in tracker. Local-first storage, with optional Cloudflare KV sync.

> **演示站说明：** 打开即可体验界面与本地打卡。多端同步需自行配置同步密码；公开演示环境可能限制在页面输入密码，请以实际部署配置为准。建议体验前先导出备份，勿在演示站存放重要隐私数据。

---

<a id="zh"></a>

## 中文说明

[English version ↓](#en)

### 在线演示

| | |
|--|--|
| **地址** | [https://daka-uwc.pages.dev/](https://daka-uwc.pages.dev/) |
| **用途** | 快速体验主站界面、今日打卡、任务管理、日历、备份等 |
| **建议** | 重要数据请用自建实例；演示站仅作功能预览 |

### 功能概览

- **今日打卡**：按分组查看进度，支持打卡 / 补卡
- **任务管理**：名称、分组、目标天数、每日次数、连续打卡、现金或其它奖品、APP / 网页链接
- **分组**：编辑时可从已有分组选择（输入联想），也可新建（下次自动出现）
- **全部任务**：筛选进行中 / 已挂起 / 已完成；搜索；批量置顶、挂起、改分类、归档、删除
- **复制任务**：进行中任务可复制为新任务（同名，弹编辑框改分类/备注；默认不带历史）
- **再开一轮**：已完成任务可再开一轮（弹编辑框）
- **挂起**：暂不打的任务可挂起（不出现在今日，历史保留，可恢复）
- **打卡明细**：默认展示最近 10 条，支持「加载更多」；保留完整时间戳
- **不自动按月归档**：历史保留在 `history`，避免跨月归档导致时间丢失或进度双计；仍兼容旧归档字段（完成天数按日期去重）
- **日历**：按月查看打卡分布，可点日期看当天明细
- **公告栏**：可编辑正文，多端同步
- **快捷入口**：公告下最多 4 个链接按钮（名称 + URL，只填链接才显示），与公告一起同步
- **多端同步**：密码保护；本地与云端合并，降低「上传失败导致进度被冲掉」的风险
- **仅本地模式**：未设置同步密码时显示「仅本地」
- **同步密码开关**：可用环境变量控制是否允许在页面输入/修改同步密码（适合公开演示）
- **同步记录**：上传/下载日志，可展开查看打卡、新增、修改、删除等变化摘要
- **设备管理**：设备备注（可清空）；可删除设备记录（带删除账本）；无备注设备约 3 天未活跃自动清理
- **联系作者**：页内表单提交意见（可选联系方式），由服务端转发，不写任务 KV
- **备份**：导出 / 导入 JSON、CSV；同步日志；设备备注
- **历史快照**：仅保存在本机最近 2 天，不上传云端
- **站点图标**：支持 favicon / 苹果主屏幕图标（`assets/`）
- **深色模式**：跟随系统或手动切换

可选独立 Worker：**每日提醒 + 奖励中心**（定时推送未完成任务、管理临期卡券），与主站解耦，见同账号 Workers 及对应说明。

### 在线使用

1. 打开 [在线演示](https://daka-uwc.pages.dev/) 或你自己的 Pages 地址  
2. 可不设同步密码，数据只存在本机（状态为 **仅本地**）  
3. 多设备同步：在允许输入密码的版本中，点击左上角 → 填写与服务端一致的同步密码  
4. 之后打开页面会自动拉取、合并，有变更时写回云端  
5. 公告点「编辑」可改正文，并配置最多 4 个快捷入口（例如奖励中心 `/panel` 地址）  
6. 意见反馈：右上角信封图标 → 填写后提交  

重要操作前后，建议在「备份管理」中导出一份 JSON。

### 部署（Cloudflare Pages + KV）

#### 文件结构

```text
/
├── index.html                 # 前端
├── assets/                    # 可选：站点图标、赞赏码等
│   ├── favicon.ico
│   ├── favicon.png
│   ├── icon-192.png
│   ├── apple-touch-icon.png
│   └── sponsor.png
└── functions/api/
    ├── get-data.js            # 读取云端数据
    ├── save-data.js           # 合并并写入（含公告 shortcuts）
    ├── contact.js             # 联系作者（不写任务 KV）
    └── sync-config.js         # 是否允许前端输入同步密码
```

#### 步骤

1. Cloudflare → **Workers & Pages** → 创建 Pages 项目（Git 或直接上传）  
2. 纯静态：Build command 留空；输出目录为站点根目录  
3. 创建 KV 命名空间，在 Pages → **Settings → Functions → KV bindings** 绑定：  
   - **变量名必须为 `dk`**  
4. **Settings → Environment variables（Production）**：

| 变量名 | 说明 |
|--------|------|
| `SYNC_PASSWORD` | 同步密码（公网务必设置） |
| `ALLOW_SYNC_PASSWORD_INPUT` | `1` 允许页面输入/修改密码；`0` 禁止输入（本机已保存密码的设备仍可同步） |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 可选，联系表单转发到 Telegram |
| `DINGTALK_WEBHOOK` / `DINGTALK_SECRET` | 可选，联系表单转发到钉钉 |

5. 部署后打开站点，确认「仅本地」或同步状态正常。

#### 接口

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/get-data` | 读取云端整包 JSON |
| POST | `/api/save-data` | 服务端合并后写回 |
| GET | `/api/sync-config` | 返回 `{ allowPasswordInput: 0\|1 }` |
| POST | `/api/contact` | 提交联系方式与意见（不写任务 KV） |

同步请求头：`X-Sync-Password: 你的密码`（若配置了 `SYNC_PASSWORD`）。

#### 改代码时改哪个文件

| 文件 | 职责 | 何时改 |
|------|------|--------|
| `index.html` | UI、本地存储、合并、公告与快捷入口、设备与同步日志 | 功能与界面 |
| `save-data.js` | 服务端合并任务 / 账本 / 设备 / **公告 shortcuts** | 合并规则、写库字段 |
| `get-data.js` | 校验密码后返回 `daka_main_data` | 一般不用改 |
| `sync-config.js` | 读取 `ALLOW_SYNC_PASSWORD_INPUT` | 很少改 |
| `contact.js` | 转发反馈到机器人 | 通知渠道变更时 |
| `assets/*` | 图标、赞赏码等静态资源 | 换图时 |

主数据在 KV 中的 key：`daka_main_data`（单 key 存整包，适合个人体量）。

批量操作（置顶、挂起、改分类、归档、删除）在本地改完选中项后 **只保存 / 上传一次**，不会按任务条数多次写 KV。

### 日常使用摘要

- **今日**：打卡 / 补卡；已挂起任务不出现在今日，也不计入今日进度  
- **全部**：筛选、搜索、批量；复制 / 再开一轮会弹出编辑框  
- **公告 + 快捷入口**：保存后多端同步；入口仅显示已填写链接的项  
- **备份管理**：导出 JSON、查看同步日志、设备备注与删除  

### 数据与安全

- 默认本地优先；云端同步使用密码保护  
- 合并策略尽量保留本地进度，并在检测到异常回退时提示  
- 历史快照仅本机，不上传  
- 联系表单不经过任务 KV  
- 公开演示可设 `ALLOW_SYNC_PASSWORD_INPUT=0`  

### 许可

见仓库 `LICENSE`（若有）。面向个人自用；公开部署请自行做好密码与访问控制。

---

<a id="en"></a>

## English

[中文说明 ↑](#zh)

### Live demo

**https://daka-uwc.pages.dev/**

Try the UI in a browser. Use your own deployment for real multi-device data. Prefer not to store sensitive data on the public demo.

### Features

- **Today**: view progress by category; support check-in and catch-up
- **Task management**: task name, category, target days, times per day, continuous check-in, cash or custom rewards, and app / web links
- **Categories**: choose from existing categories with autocomplete while editing, or create a new category that will appear in suggestions next time
- **All tasks**: filter active / paused / completed tasks; search tasks; batch pin, pause, change category, archive, or delete
- **Copy task**: copy an active task into a new task with the same name; an edit dialog lets you change category and notes, and history is not copied by default
- **New round**: reopen a completed task as a new round through the edit dialog
- **Pause**: temporarily hide a task from Today while keeping its history; paused tasks can be resumed later
- **Check-in history**: last 10 entries by default with load-more; full timestamps kept
- **No auto monthly archive**: avoids cross-month double-counting and lost times; legacy archive fields still supported with unique-date progress
- **Calendar**: view check-in distribution by month
- **Announcement**: edit the announcement text and sync it across devices
- **Quick links**: up to 4 shortcut buttons under the announcement; each uses a name + URL, and only shortcuts with a URL are displayed. They are synced together with the announcement
- **Multi-device sync**: password-protected synchronization; local and cloud data are merged to reduce the risk of progress being overwritten after a failed upload
- **Local-only mode**: when no sync password is configured, the app runs in **Local-only** mode and data stays on the current device
- **Sync password switch**: a server-side environment variable can control whether the page is allowed to enter or change the sync password, which is useful for public demonstrations
- **Sync log**: upload/download history with expandable change summary
- **Devices**: clearable notes, delete with tombstone ledger, stale auto-clean
- **Contact author**: submit feedback from the page with an optional contact method; the server forwards the message and does not write it to the task KV
- **Backup & records**: export / import JSON and CSV, view sync logs, and store a device note
- **Local snapshots**: the most recent 2 days of history are kept only on the current device and are not uploaded
- **Site icons** under `assets/`
- **Dark mode**: follow the system setting or switch manually

Optional separate Worker: **Daily Reminder + Reward Center**. It can periodically push unfinished tasks and manage expiring coupons. It is decoupled from the main site; see the corresponding Worker README in the same account/project.

### Online Use

1. Open [the live demo](https://daka-uwc.pages.dev/) or your Cloudflare Pages URL in a browser.
2. You can leave the sync password unset; the app will remain in **Local-only** mode and data will stay on the current device.
3. For multi-device sync, on versions where password input is enabled, open the top-left menu and enter the same sync password configured on the server.
4. After that, the page automatically pulls cloud data and merges it locally; when changes are detected, it writes the merged result back to the cloud.
5. In the announcement area, click **Edit** to change the announcement text and configure up to 4 quick links, such as a Reward Center `/panel` URL.
6. To send feedback, open the envelope icon in the top-right corner, fill in the form, and submit it.

For important operations or major changes, export a JSON backup from **Backup Management** first.

### Deployment (Cloudflare Pages + KV)

#### File Structure

```text
/
├── index.html                 # Frontend
├── assets/                    # Optional icons / sponsor QR
└── functions/api/
    ├── get-data.js            # Read cloud data
    ├── save-data.js           # Merge and write data, including announcement shortcuts
    ├── contact.js             # Contact author / forward feedback; does not write task KV
    └── sync-config.js         # Controls whether the frontend may enter the sync password
```

#### Steps

1. In Cloudflare, go to **Workers & Pages** and create a Pages project, either from Git or by direct upload.
2. For a static deployment, leave the **Build command** empty and use the site root as the output directory.
3. Create a KV namespace and bind it in **Pages → Settings → Functions → KV bindings**:
   - **Binding variable name must be `dk`**
4. In **Settings → Environment variables → Production**, configure:

| Variable | Description |
|----------|-------------|
| `SYNC_PASSWORD` | Sync password. Strongly recommended for any public deployment. |
| `ALLOW_SYNC_PASSWORD_INPUT` | `1` allows entering/changing the password on the page; `0` disables password input. Devices that already have a saved password can still sync. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Optional. Forward contact-form messages to Telegram. |
| `DINGTALK_WEBHOOK` / `DINGTALK_SECRET` | Optional. Forward contact-form messages to DingTalk. |

5. After deployment, open the site and verify that the status correctly shows **Local-only** or normal sync.

#### APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/get-data` | Read the complete cloud JSON package |
| POST | `/api/save-data` | Merge data on the server and write the result back to KV |
| GET | `/api/sync-config` | Return `{ allowPasswordInput: 0\|1 }` |
| POST | `/api/contact` | Submit contact information and feedback; does not write to task KV |

When `SYNC_PASSWORD` is configured, sync requests use the header:

```text
X-Sync-Password: your-password
```

#### Which File Should You Edit?

| File | Responsibility | When to edit |
|------|----------------|--------------|
| `index.html` | UI, local storage, merge logic, announcement, and quick links | Features and interface changes |
| `save-data.js` | Server-side merge of tasks / ledger / devices / **announcement shortcuts** | Merge rules or cloud data fields |
| `get-data.js` | Validate the password and return `daka_main_data` | Usually does not need changes |
| `sync-config.js` | Read `ALLOW_SYNC_PASSWORD_INPUT` | Rarely changed |
| `contact.js` | Forward feedback to notification bots | When notification channels change |

The main KV key is:

```text
daka_main_data
```

The application stores the complete main dataset under this single key, which is suitable for a personal-scale deployment.

Batch operations such as pin, pause, category change, archive, and delete are applied locally first and then saved / uploaded once for the selected items. They do not write to KV once per task.

### Daily Use Summary

- **Today**: check in or catch up; paused tasks do not appear in Today and are not counted toward today's progress
- **All tasks**: filter and search; use Copy task / New round through the edit dialog
- **Announcement + quick links**: save once to sync across devices; only shortcuts with a filled URL are displayed
- **Backup Management**: export JSON, review sync logs, and set the device note

### Data & Security

- The app is local-first by default; cloud synchronization is protected by the configured sync password
- The merge strategy attempts to preserve local progress and warns when an abnormal rollback is detected
- Local snapshots stay on the current device and are not uploaded
- Contact-form submissions do not go through the task KV
- For public demonstrations, `ALLOW_SYNC_PASSWORD_INPUT=0` can be used to prevent entering or changing the password from the page

### License

See the repository's `LICENSE` file, if present. The project is intended for personal use; for public deployments, configure a proper sync password and apply appropriate access controls.

---

<a id="sponsor"></a>

## 赞赏支持 / Support

如果这个项目对你有帮助，欢迎请作者喝杯咖啡 ☕  
赞赏完全自愿，不影响项目的正常使用。感谢每一份支持！

<div align="center">
  <img src="assets/sponsor.png" alt="赞赏码" width="420">
  <br>
  <sub>感谢你的支持 ❤️</sub>
</div>

If this project is helpful to you, you're welcome to buy the author a coffee ☕  
Sponsorship is entirely optional. Thank you for your support!
