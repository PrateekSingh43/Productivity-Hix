/**
 * Worker Application Executable Bootstrap
 * 
 * Manages runtime initialization, worker registration, and graceful OS signal shutdown.
 */

import 'dotenv/config';
import { createRedisConnection } from './runtime/redis';
import { WorkerRuntime } from './runtime/worker-runtime';
import { MemoryWorkerMetricsCollector } from './shared/metrics';

export async function bootstrap(): Promise<WorkerRuntime> {
  console.log('[WorkerBootstrap] Initializing ProductiveHix Dedicated Worker Runtime...');

  const redis = createRedisConnection();
  const metrics = new MemoryWorkerMetricsCollector();

  const runtime = new WorkerRuntime({
    connection: redis,
    metrics,
  });

  // Future specialized workers (Timeline, Pattern, Insight) will be registered here.
  // In Group 1, this bootstrap proves lifecycle initialization and shutdown wiring.

  await runtime.start();
  console.log('[WorkerBootstrap] Worker runtime started and listening for jobs.');

  let isTerminating = false;

  const handleTermination = async (signal: string) => {
    if (isTerminating) return;
    isTerminating = true;

    console.log(`[WorkerBootstrap] Received ${signal}. Initiating graceful shutdown...`);
    const shutdownTimeout = setTimeout(() => {
      console.error('[WorkerBootstrap] Graceful shutdown timed out after 15s. Forcing exit.');
      process.exit(1);
    }, 15_000);

    try {
      await runtime.stop();
      await redis.quit();
      clearTimeout(shutdownTimeout);
      console.log('[WorkerBootstrap] Graceful shutdown completed. Exiting.');
      process.exit(0);
    } catch (err) {
      clearTimeout(shutdownTimeout);
      console.error('[WorkerBootstrap] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleTermination('SIGTERM'));
  process.on('SIGINT', () => handleTermination('SIGINT'));

  return runtime;
}

// Auto-run if executed directly as entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((err) => {
    console.error('[WorkerBootstrap] Fatal error during startup:', err);
    process.exit(1);
  });
}
