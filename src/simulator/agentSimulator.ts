import { Server } from 'socket.io';

// Pune city route: Shivajinagar → Deccan → FC Road → Koregaon Park
// → Kalyani Nagar → Viman Nagar → Airport Road → back
const WAYPOINTS: [number, number][] = [
  [18.5314, 73.8446], // Shivajinagar
  [18.5280, 73.8490], // JM Road
  [18.5200, 73.8553], // Deccan Gymkhana
  [18.5150, 73.8490], // Nal Stop
  [18.5124, 73.8401], // Fergusson College Road
  [18.5100, 73.8310], // Karve Road
  [18.5086, 73.8220], // Pune University
  [18.5120, 73.8150], // Baner Road
  [18.5170, 73.8080], // Aundh
  [18.5250, 73.8200], // SP College
  [18.5320, 73.8380], // Shivajinagar circle
  [18.5362, 73.8500], // Sangamvadi
  [18.5445, 73.8735], // Koregaon Park
  [18.5490, 73.8780], // North Main Road
  [18.5530, 73.8800], // Kalyani Nagar
  [18.5570, 73.8870], // Laxmi Road East
  [18.5620, 73.8950], // Viman Nagar
  [18.5655, 73.9010], // Clover Park
  [18.5688, 73.9081], // Airport Road
  [18.5730, 73.9130], // Datta Mandir
  [18.5801, 73.9197], // Lohegaon
  [18.5878, 73.9260], // Near Airport
  // Return journey
  [18.5801, 73.9197],
  [18.5730, 73.9130],
  [18.5688, 73.9081],
  [18.5655, 73.9010],
  [18.5620, 73.8950],
  [18.5570, 73.8870],
  [18.5530, 73.8800],
  [18.5490, 73.8780],
  [18.5445, 73.8735],
  [18.5362, 73.8500],
  [18.5320, 73.8380],
  [18.5250, 73.8200],
  [18.5170, 73.8080],
  [18.5120, 73.8150],
  [18.5086, 73.8220],
  [18.5100, 73.8310],
  [18.5124, 73.8401],
  [18.5150, 73.8490],
  [18.5200, 73.8553],
  [18.5280, 73.8490],
  [18.5314, 73.8446], // back to start
];

/** Linearly interpolate between consecutive waypoints with `stepsPerSegment` steps each. */
function buildRoute(waypoints: [number, number][], stepsPerSegment: number): [number, number][] {
  const route: [number, number][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lat1, lng1] = waypoints[i];
    const [lat2, lng2] = waypoints[i + 1];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      route.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
    }
  }
  route.push(waypoints[waypoints.length - 1]);
  return route;
}

// Each segment split into 6 steps → smooth movement at 2 s interval
const ROUTE = buildRoute(WAYPOINTS, 6);

let routeIndex = 0;
let simulationInterval: ReturnType<typeof setInterval> | null = null;

export function startSimulator(io: Server): void {
  if (simulationInterval) return; // already running

  simulationInterval = setInterval(() => {
    const [lat, lng] = ROUTE[routeIndex % ROUTE.length];
    routeIndex++;

    io.emit('agent:location', {
      agentId: 'agent-001',
      agentName: 'Rajan Kumar',
      lat,
      lng,
      timestamp: new Date().toISOString(),
    });
  }, 2000);

  console.log('[simulator] Delivery agent simulation started');
}

export function stopSimulator(): void {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    routeIndex = 0;
    console.log('[simulator] Delivery agent simulation stopped');
  }
}

/** Export route for frontend to draw the planned path */
export const PLANNED_ROUTE = WAYPOINTS;
