// src/components/mock/mockToolDataService.js
import baseToolStats from "./mockToolData";

let intervalId = null;
let listeners = [];

// Utility to jitter a value a little bit
const randomize = (value, min = -2, max = 2) => {
  const delta = Math.random() * (max - min) + min;
  return Math.max(0, Math.min(100, Number((value + delta).toFixed(1))));
};

// Creates a new tool stats object with updated values
function generateUpdatedToolStats() {
  const updated = {};

  Object.keys(baseToolStats).forEach((key) => {
    const tool = baseToolStats[key];
    updated[key] = {
      ...tool,
      uptime_pct: randomize(tool.uptime_pct || 85),
      production_time_pct: randomize(tool.production_time_pct || 70),
      idle_time_percent: randomize(tool.idle_time_percent || 15),
      downtime_pct: randomize(tool.downtime_pct || 10),
      mtbf: Math.max(1, (tool.mtbf || 20) + (Math.random() - 0.5) * 2),
      mean_repair_time_hours: Math.max(
        0.5,
        (tool.mean_repair_time_hours || 2) + (Math.random() - 0.5) * 0.5
      ),
      lots_processed: (tool.lots_processed || 100) + Math.floor(Math.random() * 3),
      operations_completed: (tool.operations_completed || 200) + Math.floor(Math.random() * 5),
      queue_length_avg: randomize(tool.queue_length_avg || 5, -0.5, 0.5),
      q_length_std: randomize(tool.q_length_std || 1.2, -0.1, 0.1),
    };
  });

  return updated;
}

export function startToolMockStream(interval = 2000) {
  if (intervalId) return;

  intervalId = setInterval(() => {
    const updatedStats = generateUpdatedToolStats();
    listeners.forEach((cb) => cb(updatedStats));
  }, interval);
}

export function subscribeToolData(callback) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

export function stopToolMockStream() {
  clearInterval(intervalId);
  intervalId = null;
  listeners = [];
}
