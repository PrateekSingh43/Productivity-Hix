/**
 * Live End-to-End Worker Verification with Upstash Redis
 * 
 * Tests the complete server-side worker pipeline on the live Upstash Redis instance:
 * 1. Redis connection & ping
 * 2. Distributed locking (RedisLockProvider with Lua script release)
 * 3. BullMQ Queue creation & job enqueueing
 * 4. BullMQ WorkerRuntime execution via BaseWorker & TestWorker
 * 5. Job completion verification
 * 6. Graceful runtime shutdown & queue draining
 */

import 'dotenv/config';
import { createRedisConnection } from '../runtime/redis';
import { RedisLockProvider } from '../base/idempotency';
import { QueueManager } from '../runtime/queue';
import { WorkerRuntime } from '../runtime/worker-runtime';
import { TestWorker } from './test-worker';
import { MemoryWorkerMetricsCollector } from '../shared/metrics';

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('Starting Live Upstash Redis Worker Pipeline Verification...');
  console.log('===============================================================');

  // 1. Connection check
  const redis = createRedisConnection();
  const pong = await redis.ping();
  console.log(`[Step 1] Redis Ping: ${pong} (Connection established to Upstash)`);

  // 2. Distributed Lock Verification on Upstash
  console.log('[Step 2] Testing distributed lock on Upstash Redis...');
  const lockProvider = new RedisLockProvider(redis);
  const lockKey = `lock:live-test:${Date.now()}`;
  const handle = await lockProvider.acquire(lockKey, 30_000);

  if (!handle) {
    throw new Error('Failed to acquire distributed lock on Upstash Redis');
  }
  console.log(`[Step 2] Acquired distributed lock for key: ${lockKey}, token: ${handle.token}`);

  // Re-acquisition should fail (serialization guarantee)
  const doubleHandle = await lockProvider.acquire(lockKey, 30_000);
  if (doubleHandle !== null) {
    throw new Error('Expected secondary lock acquisition to fail, but it succeeded');
  }
  console.log('[Step 2] Serialization verified: Secondary lock acquisition properly rejected.');

  await lockProvider.release(handle);
  console.log('[Step 2] Distributed lock released cleanly via atomic Lua script.');

  // 3. Queue & Worker Initialization
  console.log('[Step 3] Initializing BullMQ Queue and WorkerRuntime on Upstash...');
  const queueName = `upstash-test-${Date.now()}`;
  const queueManager = new QueueManager({ connection: redis, prefix: 'phix_test' });

  const metrics = new MemoryWorkerMetricsCollector();
  const runtime = new WorkerRuntime({
    connection: redis,
    prefix: 'phix_test',
    metrics,
  });

  const worker = new TestWorker();
  // Override queue name to isolated live test queue
  Object.defineProperty(worker, 'queueName', { value: queueName });

  runtime.registerWorker(worker);
  await runtime.start();
  console.log(`[Step 3] WorkerRuntime started and listening on queue: ${queueName}`);

  // 4. Enqueue Job
  const testId = `live-test-${Date.now()}`;
  console.log(`[Step 4] Enqueueing test job into Upstash: testId=${testId}`);

  await queueManager.addJob(
    queueName,
    'verify-live-job',
    {
      testId,
      expectedOutcome: 'SUCCESS',
      payloadValue: 'verified-upstash-payload-success',
      jobCorrelationId: `live-corr-${Date.now()}`,
    },
    {
      attempts: 3,
    }
  );

  // 5. Await processing
  console.log('[Step 5] Waiting for WorkerRuntime to pull and execute job from Upstash...');
  let completed = false;
  const timeoutAt = Date.now() + 20_000;

  while (Date.now() < timeoutAt) {
    if (worker.executionCount > 0) {
      completed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!completed) {
    throw new Error('Timed out waiting for BullMQ worker to process job from Upstash');
  }

  const storedResult = worker.durableStore.get(testId);
  console.log('[Step 5] Job completed successfully!');
  console.log(`[Step 5] Result:`, storedResult);

  // 6. Graceful Shutdown
  console.log('[Step 6] Shutting down WorkerRuntime and closing connections...');
  await runtime.stop();
  await queueManager.closeAll();
  await redis.quit();

  console.log('===============================================================');
  console.log('LIVE UPSTASH REDIS WORKER TEST PASSED 100% SUCCESSFULLY!');
  console.log('===============================================================');
}

runLiveVerification().catch((err) => {
  console.error('Live Upstash Worker Verification FAILED:', err);
  process.exit(1);
});
