// mockDataService.js

export const generateMockRow = () => ({
  oee: Math.floor(Math.random() * 101),
  wipLots: Math.floor(Math.random() * 101),
  wipLotsAdd: Math.floor(Math.random() * 51),
  activeTools: Math.floor(Math.random() * 101),
  activeToolsPercent: Math.floor(Math.random() * 101),
  wipMax: Math.floor(Math.random() * 101),
  wipMin: Math.floor(Math.random() * 101),
  wipSize: Math.floor(Math.random() * 101),
  weeklyAvg: Math.floor(Math.random() * 101),
  inspect: Math.floor(Math.random() * 101),
  ratio: Math.floor(Math.random() * 101),
  capacity: Math.floor(Math.random() * 101),
  capacity2: Math.floor(Math.random() * 101),
  pctOee: Math.floor(Math.random() * 101),       
  quality: Math.floor(Math.random() * 101),      
  performance: Math.floor(Math.random() * 101),  
  avaliability: Math.floor(Math.random() * 101),
  toolTop: Math.floor(Math.random() * 101),
  toolBottom: Math.floor(Math.random() * 101),
  lotsIdle: Math.floor(Math.random() * 101),
  liq: Math.floor(Math.random() * 101),
  lip: Math.floor(Math.random() * 101),
  ordersDone: Math.floor(Math.random() * 100),
  orders: [
    { id: 1011, currentLot: 28, totalLots: 30, eta: 13 },
    { id: 1015, currentLot: 11, totalLots: 25, eta: 21 },
    { id: 1020, currentLot: 7, totalLots: 40, eta: 35 },
    { id: 1024, currentLot: 10, totalLots: 10, eta: 5 },
    { id: 1030, currentLot: 0, totalLots: 50, eta: 48 },
  ],
  ordersDone: 12,
  target: 50,
});

let intervalId = null;
let listeners = [];

export function startMockStream(interval = 2000) {
  if (intervalId) {
    console.log("Stream already running");
    return; 
  }

  console.log("Starting mock data stream");

  intervalId = setInterval(() => {
    const row = generateMockRow();
    
    console.log("Emitting row to", listeners.length, "listeners:", row);
    listeners.forEach((cb) => cb(row));
  }, interval);
}

export function subscribe(callback) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

export function stopMockStream() {
  clearInterval(intervalId);
  intervalId = null;
  listeners = [];
  console.log("Mock stream stopped");
}
