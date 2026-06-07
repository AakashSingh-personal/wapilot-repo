import 'dotenv/config';
import { log } from './utils/logger.js';
import { startSchedulingWorkers } from './scheduling/workers.registry.js';

process.env.WORKER_STANDALONE = process.env.WORKER_STANDALONE || 'true';

async function main() {
  await startSchedulingWorkers();
  log('info', 'scheduling_worker_process_ready', {
    standalone: true,
    rabbitmq: Boolean(process.env.RABBITMQ_URL),
  });
}

main().catch((e) => {
  log('error', 'worker_boot_failed', { message: e.message });
  process.exit(1);
});
