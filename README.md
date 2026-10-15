# 云雨棋室

有禁手五子棋挑战：你执白，从少量防守候选点中反复尝试，黑棋按预先录入的路线应对。前端部署到 GitHub Pages，后端部署到 Cloudflare Workers。

自定义域名：https://wuzi.roxy-design.com

GitHub Pages 项目：https://sliuhaob.github.io/yunyu-renju-classroom/

后端：https://yunyu-renju-api.version-register.workers.dev

## 本期棋形

云月：**黑1 H8、白2 I9、黑3 I8、白4 H7**。两颗黑子位于两个白子之间，四子围绕 H8 与 I8 的中点呈中心对称。黑5 固定 G10。

默认进入 **G8 防守挑战**：黑5 G10、白6 G8、黑7 F9 已落好，从白8的 F10、H11、F11、H9 四个入口开始。之后每轮白棋提供 1–5 个候选点，冲四时保留必须处理的防点；每个黑棋局面只录入一个应手。白8 H11、黑9 E9 后，白10可选 F7、J11、D9、F11、H9；F11 后黑11固定应 D9，H9 后黑11固定应 F10。白10 D9 后黑11固定应 F11，白12可选 H9、E12，E12 后黑13固定应 F10。

G8 和 J7 的所有分支统一在黑棋首次形成合法四三时结束，后续落子已从棋谱中截去；直接成五也结束。四三必须由一个四和一个真实活三组成，假活三、三三、四四、长连不会触发挑战完成。页面显示“黑棋四三”，与“黑棋成五”区分；四三是本项目的挑战结束条件，不改变 RIF 的成五规则。

G8 当前为 1,341 个局面、279 条挑战路线：263 条止于四三，16 条止于成五，结束手数为第17–43手。较早形成四三后相同的后续路线已合并为一个结束点。J7 使用同样的结束判断，保留 3,471 个压缩战术入口；这些入口不计入 G8 的覆盖率。随局讲解已移除。

原路线由定式主线与离线引擎候选组成，连续冲四使用迭代加深搜索；发布时统一截断到首个四三或成五。所有保留的候选都验证到挑战结束点，没有中途断谱。覆盖范围是选定的白棋防守菜单，尚无全局最快或所有合法白棋应手的证明。未能闭合的新候选写入本地 `artifacts/g8-unresolved.json`，不进入线上菜单。

云月与雨月有盘端距离差异。本版采用云月实际坐标，没有把棋谱平移后声称雨月同样获胜。固定开局教学不实现比赛中的交换、五手打点及计时流程。

## 本地使用

需要 Node.js 22 或更高版本。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。本地服务器复用 Worker 的相同 API 处理代码。

```sh
npm test
npm run verify:book
node scripts/analyze-book.mjs
npm run build
npx wrangler deploy --dry-run
```

界面支持棋盘落子、固定黑棋应对、提示、手数开关、黑棋禁手标记、逐手复盘、悔棋、演示、JSON 导出、当前浏览器自动存档。键盘可用方向键移动焦点，回车或空格落子。

## 部署

1. 在 `wrangler.jsonc` 中把 `ALLOWED_ORIGINS` 加入 GitHub Pages 的来源（只有协议和域名，不带仓库路径），例如 `https://YOUR_NAME.github.io`。
2. 登录 Cloudflare 并部署 API：

   ```sh
   npx wrangler login
   npm run deploy:api
   ```

3. 将仓库推到 GitHub，设置仓库 Actions 变量 `RENJU_API_BASE` 为输出的 HTTPS Worker 根地址。不要把任何 Cloudflare Token 写入前端。
4. 仓库 Settings → Pages → Source 选择 **GitHub Actions**。推送 `main` 或手动运行 `Deploy classroom to GitHub Pages` 工作流即可发布。

前端全部使用相对资源路径，兼容 `https://USER.github.io/REPO/`。缺少 API 地址时 CI 会明确失败，避免发布无法连接的课堂。

本项目无数据库、无账号系统、无服务器持久化对局；学习进度保存在浏览器 localStorage。清理浏览器数据会清除进度，可先导出棋谱。Worker 无需 D1/KV 或付费 AI 服务。

## 结构

- `public/`：原生 HTML/CSS/JS 教学界面。
- `src/renju.mjs`：禁手与成五判断；递归判断真实活三，四按子集去重；独立的挑战重放在首个黑棋四三结束。
- `src/book.mjs`：固定开局、主线、原创讲解与来源。
- `data/responses.json`：运行时使用的固定应对及压缩冲四证明。
- `data/g8.json`：G8 挑战的完整有限策略树；白八 4 个选点，后续白棋 1–5 个选点，黑棋一个应手。
- `src/session.mjs`：棋谱遍历、合法性校验、复盘状态。
- `worker/index.mjs`：无状态 JSON API，限制请求大小并按来源配置 CORS。
- `scripts/tactics.mjs`、`generate-book.mjs`：仅离线生成冲四应对，线上不运行搜索。
- `scripts/verify-book.mjs`：验证全部棋谱转换及冲四证明。
- `scripts/build-g8.mjs`：离线生成 G8 候选树；`scripts/verify-g8.mjs` 验证每条路线在首个合法四三或成五处结束。
- `scripts/trim-books.mjs`：统一裁剪 G8 树和 J7 压缩分支，删除结束点后的节点，并重新统计路线；两种生成器发布时都会调用。
- `.github/workflows/pages.yml`：测试、验证、构建、部署前端。

API：`GET /api/health`、`GET /api/lessons`、`POST /api/state`、`POST /api/move`。POST 输入为 `{history: ["H8", ...], lessonId: "main", move: "G8"}`，`move` 仅落子时需要。黑棋回合不传 `move`。

新增主线时修改 `src/book.mjs`，运行 `node scripts/generate-book.mjs`，随后运行测试和验证。每个黑棋节点只能有一个固定应手；白棋节点允许多个分支。未知分支必须明确保留为未收录。

重建 G8 树需将 [Rapfi 官方发行版 250615](https://github.com/dhbloo/rapfi/releases/tag/250615) 的 Windows SSE 引擎、配置与权重放入本地 `artifacts/rapfi/`（或设置 `RAPFI_DIR`），再运行 `npm run build:g8`。本仓库不分发引擎和权重，也不在线运行引擎；生成的落子数据和独立验证器已提交。CI 只验证已提交棋谱，不重新调用引擎。

## 棋谱与规则来源

- [励精连珠教室：云月白4 H7、黑5 G10](https://www.ljrenju.com/croom/i06/i06ba.htm)：本期两个主线的事实性落子坐标参考图 `i062111.gif`、`i062725.gif`。不包含该网站原图、原文或整套棋谱。
- [RIF 国际连珠规则](https://gomoku.renju.net/rifrules/)：第 9.1–9.3 条，黑三三、四四、长连及成五优先；白棋没有相应禁手。

讲解和界面均为本项目新写。收束变化由程序独立生成。验证覆盖落子合法性、真实活三、直接成五点，以及所有保留路线在首次四三或成五后停止；接口拒绝结束后继续落子。这里验证的是所录候选路线，不是所有白棋防守的穷尽证明。
