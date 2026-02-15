import { createClient, type RedisClientType } from 'redis';
import { config } from './app.js';

export let redis: RedisClientType;

export async function initRedis(): Promise<void> {
  redis = createClient({ url: config.redisUrl });

  redis.on('error', (err) => console.error('[Redis] Error:', err));
  redis.on('connect', () => console.log('[Redis] Connected'));

  await redis.connect();
}
