# 锡林浩特机场 AI 智能大数据大屏（领导演示原型）

深色霓虹风格静态原型，基于 **Layui + ECharts + jQuery**，风格对齐 `report8.html`。  
中文界面；**所有可见文案可双击编辑**，保存到 `localStorage`，可导出 / 导入 `content.json`。

## 在线仓库

https://github.com/liupengcheng53-sudo/xilinhot-airport-dashboard

## 如何本地打开

### 方式一：静态服务器（推荐，避免部分浏览器限制 `fetch` 本地 JSON）

```bash
# 进入仓库目录后任选其一
npx --yes serve -p 5173
# 或
python3 -m http.server 5173
```

浏览器打开：http://localhost:5173/

### 方式二：直接打开 HTML

用浏览器打开 `index.html` / `flight.html`。  
若 JSON 加载失败（`file://` 跨域限制），请改用方式一。

## 页面说明

| 页面 | 说明 |
|------|------|
| `index.html` | 首屏 3×3 九宫格 |
| `flight.html` | 航班表格 + 机位甘特（**同一份** `data/flights.json`） |

### 九宫格

- **左1** 在场人数 + 部门图 → 大弹窗：部门 → 班组 → 在岗/不在岗 + 本周排班  
- **左2** 设施设备数字 → 简化弹窗  
- **左3** 行为上墙表格 → 查询 + 行详情  
- **中1 / 中2** 航班摘要 / 下一班动态 → 进入 `flight.html`  
- **中3** 安检排队（占位）  
- **右1** 气象；风速 **12–15 黄，>15 红**  
- **右2** STOP 在线人数/设备；弹窗打开本地 `stop.html`（登录缓存 token，无嵌套滚动条；远端原站可备用）  
- **右3** AI 态势预警图 + 展开弹窗  

## 文案可点编

1. **双击**带虚线底的文案进入编辑，回车或失焦保存。  
2. 右上角 **导出文案** → 下载完整 `content.json`。  
3. **导入文案** → 选择 JSON，合并后写入 `localStorage`。  
4. 清除本地修改（浏览器控制台）：

```js
localStorage.removeItem('xilinhot_content_v1')
```

默认文案源文件：`data/content.json`。HTML 中用 `class="ed" data-k="键名"` 标记可编辑节点。

## 数据文件（mock）

```
data/
  content.json          # 默认可编辑文案
  personnel.json        # 左1 部门/班组/排班
  facility.json         # 左2 设施设备
  behavior.json         # 左3 行为上墙
  flights.json          # 中1/中2 + flight 页（表格+甘特共用）
  security-queue.json   # 中3 安检排队
  weather.json          # 右1 气象
  stop.json             # 右2 STOP
  ai-alerts.json        # 右3 AI 预警
```

### 航班 JSON 结构要点

- `flights[]`：航班主数据（状态驱动表格行底色）  
- `stands[].occupancy[].flightId`：机位占用，关联到 `flights[].id`  
- `statusColors` / `ganttBarColors`：表格行色与甘特条颜色  

## 技术栈

- [Layui](https://layui.dev/)（弹层 `layer`、按钮等）— 来自源码包 `参考/lib/layui/`  
- ECharts、jQuery 3.4.1 — 同包复用  
- 纯静态，无构建步骤  

## 需求文档

见仓库内 [REQUIREMENTS.md](./REQUIREMENTS.md)。

## 二次修改提示

- 改文案键：编辑 `data/content.json`，并在 HTML 增加 `data-k`。  
- 改弹窗：`js/app.js` 内 `openDeptModal` / `openFacilityModal` 等。  
- 改甘特时间轴：`js/flight.js` 顶部 `GANTT_START_HOUR` / `PX_PER_HOUR`。  
- 样式变量：`css/dashboard.css` 的 `:root`。  

## 参考图

`refs/` 目录含领导提供的首页、航班表、甘特、设施风格截图，仅供对照，不参与运行。
