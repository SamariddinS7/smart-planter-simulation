import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

export async function setup() {
  try {
    mongod = await MongoMemoryServer.create({
      instance: {
        port: 27017,
      },
    });
  } catch (_e) {
    // If external MongoDB is already running on 27017, ignore
  }
}

export async function teardown() {
  if (mongod) {
    await mongod.stop();
  }
}
