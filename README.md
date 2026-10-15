# 云雨棋室

有禁手五子棋挑战：你执白，从少量防守候选点中反复尝试，黑棋按预先录入的路线应对。前端部署到 GitHub Pages，后端部署到 Cloudflare Workers。

自定义域名：https://wuzi.roxy-design.com

GitHub Pages 项目：https://sliuhaob.github.io/yunyu-renju-classroom/

后端：https://yunyu-renju-api.version-register.workers.dev

## 本期棋形

云月：**黑1 H8、白2 I9、黑3 I8、白4 H7**。两颗黑子位于两个白子之间，四子围绕 H8 与 I8 的中点呈中心对称。黑5 固定 G10。

默认进入 **G8 防守挑战**：黑5 G10、白6 G8、黑7 F9 已落好，从白8的 F10、H11、F11、H9 四个入口开始。之后每轮白棋提供 1–3 个候选点，冲四时保留必须处理的防点；每个黑棋局面只录入一个应手。当前 2,060 个局面、404 条完整终局路线，最早在第21手、最晚在第45手黑棋成五。

所有选定分支都已验证到终局，没有中途未收录的落点。这里保证的是候选菜单内的黑胜，不是所有白棋合法走法的完整必胜证明。随局讲解已移除。J7 保留旧的定式练习；旧库中的 3,673 个战术入口不用于描述 G8 挑战的覆盖率。

黑棋连续冲四收束使用迭代加深找到的最短 VCF；开局应手由原主线和离线引擎候选组成，尚未证明全局最快取胜。引擎评分不作为胜负证明，只有完整重放后黑棋合法成五的路线才发布。未能闭合的新候选写入本地 `artifacts/g8-unresolved.json`，不进入线上菜单。

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
- `src/renju.mjs`：禁手与成五判断；递归判断真实活三，四按子集去重。
- `src/book.mjs`：固定开局、主线、原创讲解与来源。
- `data/responses.json`：运行时使用的固定应对及压缩冲四证明。
- `data/g8.json`：G8 挑战的完整有限策略树；白八 4 个选点，后续白棋 1–3 个选点，黑棋一个应手。
- `src/session.mjs`：棋谱遍历、合法性校验、复盘状态。
- `worker/index.mjs`：无状态 JSON API，限制请求大小并按来源配置 CORS。
- `scripts/tactics.mjs`、`generate-book.mjs`：仅离线生成冲四应对，线上不运行搜索。
- `scripts/verify-book.mjs`：验证全部棋谱转换及冲四证明。
- `scripts/build-g8.mjs`：离线生成 G8 候选树；`scripts/verify-g8.mjs` 验证每条路线闭合且黑棋获胜。
- `.github/workflows/pages.yml`：测试、验证、构建、部署前端。

API：`GET /api/health`、`GET /api/lessons`、`POST /api/state`、`POST /api/move`。POST 输入为 `{history: ["H8", ...], lessonId: "main", move: "G8"}`，`move` 仅落子时需要。黑棋回合不传 `move`。

新增主线时修改 `src/book.mjs`，运行 `node scripts/generate-book.mjs`，随后运行测试和验证。每个黑棋节点只能有一个固定应手；白棋节点允许多个分支。未知分支必须明确保留为未收录。

重建 G8 树需将 [Rapfi 官方发行版 250615](https://github.com/dhbloo/rapfi/releases/tag/250615) 的 Windows SSE 引擎、配置与权重放入本地 `artifacts/rapfi/`（或设置 `RAPFI_DIR`），再运行 `npm run build:g8`。本仓库不分发引擎和权重，也不在线运行引擎；生成的落子数据和独立验证器已提交。CI 只验证已提交棋谱，不重新调用引擎。

## 棋谱与规则来源

- [励精连珠教室：云月白4 H7、黑5 G10](https://www.ljrenju.com/croom/i06/i06ba.htm)：本期两个主线的事实性落子坐标参考图 `i062111.gif`、`i062725.gif`。不包含该网站原图、原文或整套棋谱。
- [RIF 国际连珠规则](https://gomoku.renju.net/rifrules/)：第 9.1–9.3 条，黑三三、四四、长连及成五优先；白棋没有相应禁手。

讲解和界面均为本项目新写。收束变化由程序独立生成；验证覆盖其每一步黑棋合法性、直接成五点、白棋反杀及唯一防点后的后续证明。主线验证说明它们在所录白棋应手下可走通，不是所有白棋防守的穷尽证明。
