import 'dotenv/config';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { tick } from '../server/domain.js';

const store = new Store();
const ai = {
  key: process.env.DEEPSEEK_API_KEY || '',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: Number(process.env.AI_TIMEOUT_MS || 20000),
};

let ready: Promise<void> | undefined;
function initialize() {
  ready ??= store.init(
    process.env.MONGO_URI || '',
    process.env.MONGO_DB || 'smart_planter_demo',
  ).then(() => undefined);
  return ready;
}

const app = createApp(store, ai);
let lastTick = 0;

export default async function handler(req: any, res: any) {
  await initialize();
  const now = Date.now();
  if (now - lastTick > 1000) {
    lastTick = now;
    await store.mutate((state) => tick(state));
  }
  return app(req, res);
}
