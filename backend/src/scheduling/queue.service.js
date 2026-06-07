import { log } from '../utils/logger.js';

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'wapilot.scheduling';

const QUEUES = {
  reminders: 'scheduling.tick.reminders',
  waitlist: 'scheduling.tick.waitlist',
  calendar: 'scheduling.tick.calendar',
  rebooking: 'scheduling.tick.rebooking',
  idempotency: 'scheduling.tick.idempotency',
};

let channelPromise = null;

function envTruthy(value) {
  if (value === undefined || value === null || value === '') return null;
  return value === '1' || String(value).toLowerCase() === 'true';
}

/** Run background workers in this process (default: true — same deployment). Set false to deploy worker separately. */
export function isWorkerEnabled() {
  const explicit = envTruthy(process.env.WORKER_ENABLE);
  if (explicit !== null) return explicit;
  if (process.env.SCHEDULING_RUN_WORKERS === '0') return false;
  return true;
}

/** True when started via `npm run worker` / worker.js (dedicated worker deployment). */
export function isStandaloneWorkerProcess() {
  if (envTruthy(process.env.WORKER_STANDALONE) === true) return true;
  if (process.env.SCHEDULING_WORKER_MODE === 'standalone') return true;
  return false;
}

/** Whether server.js should start workers on boot. */
export function shouldStartWorkersInProcess() {
  return isWorkerEnabled();
}

export function isRabbitMqEnabled() {
  if (!process.env.RABBITMQ_URL) return false;
  const flag = envTruthy(process.env.SCHEDULING_USE_RABBITMQ);
  if (flag === false) return false;
  return true;
}

async function ensureTopology(ch) {
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true, autoDelete: false });
  for (const [name, queue] of Object.entries(QUEUES)) {
    await ch.assertQueue(queue, { durable: true, autoDelete: false });
    await ch.bindQueue(queue, EXCHANGE, queue);
    log('info', 'rabbitmq_topology_ready', { exchange: EXCHANGE, queue, routingKey: queue, worker: name });
  }
}

async function getChannel() {
  if (!isRabbitMqEnabled()) return null;
  if (!channelPromise) {
    channelPromise = (async () => {
      const amqp = await import('amqplib');
      const conn = await amqp.default.connect(process.env.RABBITMQ_URL);
      conn.on('error', (e) => log('error', 'rabbitmq_connection_error', { message: e.message }));
      conn.on('close', () => {
        channelPromise = null;
        log('warn', 'rabbitmq_connection_closed');
      });
      const ch = await conn.createChannel();
      await ensureTopology(ch);
      return ch;
    })().catch((e) => {
      channelPromise = null;
      throw e;
    });
  }
  return channelPromise;
}

function startPollWorker(name, handler, intervalMs) {
  setInterval(() => void handler().catch((err) => {
    log('warn', 'poll_worker_failed', { name, message: err.message });
  }), intervalMs);
  log('info', 'poll_worker_started', { name, intervalMs });
}

async function startRabbitPublisher(name, intervalMs) {
  const ch = await getChannel();
  if (!ch) return;
  const routingKey = QUEUES[name];
  const publish = () => {
    ch.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify({ at: Date.now(), worker: name })),
      { persistent: true, contentType: 'application/json' },
    );
  };
  publish();
  setInterval(publish, intervalMs);
  log('info', 'rabbit_tick_publisher_started', { name, exchange: EXCHANGE, routingKey, intervalMs });
}

async function startRabbitConsumer(name, handler) {
  const ch = await getChannel();
  if (!ch) return;
  const queue = QUEUES[name];
  await ch.consume(queue, (msg) => {
    if (!msg) return;
    void handler()
      .catch((err) => log('warn', 'rabbit_worker_failed', { name, message: err.message }))
      .finally(() => ch.ack(msg));
  });
  log('info', 'rabbit_consumer_started', { name, queue, exchange: EXCHANGE });
}

/**
 * Register scheduling background workers.
 *
 * Poll mode (no RABBITMQ_URL): in-process setInterval when WORKER_ENABLE=true or standalone worker.
 *
 * RabbitMQ mode (RABBITMQ_URL set): topic exchange + queues auto-created on connect.
 *   WORKER_ENABLE=true  → same deployment runs publishers + consumers (no separate worker needed).
 *   WORKER_ENABLE=false → API skips workers; deploy `npm run worker` (standalone publishes + consumes).
 */
export async function registerSchedulingWorkers(workers) {
  const standalone = isStandaloneWorkerProcess();
  const enabled = isWorkerEnabled();

  if (!standalone && !enabled) {
    log('info', 'workers_skipped', {
      workerEnable: false,
      hint: 'Set WORKER_ENABLE=true on API or deploy npm run worker',
    });
    return;
  }

  if (!isRabbitMqEnabled()) {
    for (const [name, { handler, intervalMs }] of Object.entries(workers)) {
      startPollWorker(name, handler, intervalMs);
    }
    log('info', 'scheduling_poll_workers_ready', { embedded: !standalone, standalone });
    return;
  }

  for (const [name, { handler, intervalMs }] of Object.entries(workers)) {
    await startRabbitPublisher(name, intervalMs);
    await startRabbitConsumer(name, handler);
  }

  log('info', 'scheduling_rabbit_workers_ready', {
    exchange: EXCHANGE,
    embedded: enabled && !standalone,
    standalone,
  });
}
