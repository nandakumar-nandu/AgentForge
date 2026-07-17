import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server | null = null;

/**
 * ============================================================================
 * SOCKET.IO ROOMS DESIGN & ARCHITECTURE:
 * ============================================================================
 * 
 * 1. Concept:
 *    Socket.io "rooms" allow creating virtual channels/groups that sockets can join
 *    or leave dynamically. This enables targeted message delivery instead of
 *    broadcasting updates to every single connected client on the server.
 * 
 * 2. Room Naming Structure:
 *    In AgentForge, we scope rooms around specific batch job tracking resources.
 *    Each job gets its own unique room matching: `job:${jobId}`.
 * 
 * 3. Subscription Flow:
 *    - When a client is viewing the details/progress of a specific job, the client
 *      submits a request to watch that job by emitting `join-job` with the target `jobId`.
 *    - The server socket listener intercepts this, calls `socket.join(room)`, and registers
 *      the client socket as an observer of that specific job channel.
 *    - As the background BullMQ Worker processes prompts, progress events are dispatched
 *      specifically to that room: `io.to(room).emit('job:progress', data)`.
 *    - When the user navigates away or the job finishes, the socket can leave the room:
 *      `socket.leave(room)`, conserving server network resource footprints.
 * ============================================================================
 */

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all client connections (configured for developer monorepos)
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Join a specific job room
    socket.on('join-job', (jobId: string) => {
      if (!jobId) return;
      const roomName = `job:${jobId}`;
      socket.join(roomName);
      console.log(`[Socket.io] Socket ${socket.id} joined room "${roomName}"`);
    });

    // Leave a specific job room
    socket.on('leave-job', (jobId: string) => {
      if (!jobId) return;
      const roomName = `job:${jobId}`;
      socket.leave(roomName);
      console.log(`[Socket.io] Socket ${socket.id} left room "${roomName}"`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io server instance is not initialized. Make sure initSocket(server) is executed first.');
  }
  return io;
}
