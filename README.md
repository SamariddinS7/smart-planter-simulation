# 智慧盆栽移动端仿真平台

面向世界职业院校技能大赛展示的移动端网页，包含养护智能问答、需水趋势预测、多设备协同管理和演示控制面板。设备数据、预测、任务和浇水均为仿真；PlantsIO 设备本身未被声明具备主动泵控能力。

## 本地运行

要求 Node.js 20+、npm 和 MongoDB。当前电脑已经具备这些环境。

```bash
cd "/Users/kim/Desktop/Codex_Project/20260918-世职赛项目准备/移动端仿真平台/app"
cp .env.example .env
npm install
npm run dev
```

电脑访问 `http://localhost:5173/`。手机与电脑连接同一局域网后，访问终端中 Vite 输出的 `Network` 地址，例如 `http://172.20.10.14:5173/`。IP 地址变化后以最新输出为准。

也可以运行：

```bash
./scripts/start-local.sh
```

## DeepSeek 配置

编辑 `.env`，填写：

```dotenv
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=你的账号可用模型名称
```

密钥只由 Express 后端读取，不会返回给浏览器。未配置密钥、模型不可用或请求超时，都可以切换到仿真问答。自动测试使用模拟响应，不会消耗模型额度。

## 构建、测试与生产运行

```bash
npm test
npm run typecheck
npm run build
npm start
```

生产模式由 Express 在 `3001` 端口同时提供 REST API 和构建后的网页。

## 数据说明

- 独立数据库：`smart_planter_demo`。
- MongoDB 中保存一个有界的演示状态快照，确保设备、任务回执与供水量同步更新。
- 演示控制面板支持缺水、离线、恢复、历史数据不足、AI 不可用、暂停与重置。
- 一键重置只替换本应用的演示快照；界面要求二次确认。
- 无账号登录，首版只适合可信局域网，不应直接暴露到公网。

更多说明见 [演示操作说明](docs/演示操作说明.md)、[测试结果](docs/测试结果.md)、[设计验收](design-qa.md) 和 [阿里云宝塔部署说明](docs/阿里云宝塔部署说明.md)。
