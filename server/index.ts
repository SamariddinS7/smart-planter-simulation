import 'dotenv/config';
import { Store } from './store.js';
import { tick } from './domain.js';
import { createApp } from './app.js';

let mongodInstance: any = null;
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const mongoDb = process.env.MONGO_DB || 'smart_planter_demo';
const store = new Store();

try {
  await store.init(mongoUri, mongoDb);
} catch (err: any) {
  if (err?.name === 'MongooseServerSelectionError' || err?.message?.includes('ECONNREFUSED')) {
    console.log('Local MongoDB not detected on 27017, starting embedded MongoMemoryServer...');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongodInstance = await MongoMemoryServer.create({ instance: { port: 27017 } }).catch(async () => {
      return await MongoMemoryServer.create();
    });
    const fallbackUri = mongodInstance.getUri();
    await store.init(fallbackUri, mongoDb);
    console.log(`Connected to embedded MongoDB at ${fallbackUri}`);
  } else {
    throw err;
  }
}

const app = createApp(store, {
  key: process.env.DEEPSEEK_API_KEY || '',
  model: process.env.DEEPSEEK_MODEL || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: Number(process.env.AI_TIMEOUT_MS || 20000)
});
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(`Smart Planter API / production UI: http://localhost:${port}`)
);
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await store.mutate(s => tick(s));
  } catch (e) {
    console.error('Simulation paused: persistence failed');
  } finally {
    busy = false;
  }
}, 1000);

async function close() {
  clearInterval(timer);
  server.close();
  await store.close();
  if (mongodInstance) await mongodInstance.stop();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);

