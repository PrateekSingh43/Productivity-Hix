import 'dotenv/config';
import Redis from 'ioredis';

async function testUpstash() {
  console.log('Testing Upstash connection...');
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!restUrl || !token) {
    console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
  }

  const hostname = new URL(restUrl).hostname;
  const redisUrl = `rediss://default:${token}@${hostname}:6379`;

  console.log(`Connecting to rediss://${hostname}:6379 ...`);

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    const pong = await redis.ping();
    console.log('PING response:', pong);

    await redis.set('test:productivehix:worker', 'connected_successfully', 'EX', 60);
    const val = await redis.get('test:productivehix:worker');
    console.log('GET test:productivehix:worker:', val);

    await redis.quit();
    console.log('UPSTASH REDIS CONNECTION VERIFIED SUCCESSFULLY!');
  } catch (err) {
    console.error('Failed to connect to Upstash Redis:', err);
    process.exit(1);
  }
}

testUpstash();
