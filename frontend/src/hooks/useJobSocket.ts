/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Job } from '@agentforge/shared';

/**
 * React Hook for Socket.io Real-time Job Events.
 * Keeps a local array of Jobs in sync with background BullMQ worker events.
 * 
 * @param jobsList The current list of jobs displayed on the dashboard
 * @param setJobsList State setter to update the jobs array in the parent component
 */
export function useJobSocket(
  jobsList: any[],
  setJobsList: React.Dispatch<React.SetStateAction<any[]>>
) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Read the server socket URL from the environment or default to local backend
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5001';
    
    // Connect to the socket server
    const socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log(`[Socket.io Hook] Connected to socket server at ${socketUrl}. Connection ID: ${socketInstance.id}`);
      
      // Re-join rooms for any active, pending, or paused jobs in the dashboard list
      jobsList.forEach((job) => {
        if (job.status === 'pending' || job.status === 'active' || (job as any).status === 'paused') {
          socketInstance.emit('join-job', job.id);
          console.log(`[Socket.io Hook] Request to join room for active job: ${job.id}`);
        }
      });
    });

    /**
     * Event Handler: 'job:progress'
     * Triggered when the worker completes an item and updates progress.
     */
    socketInstance.on('job:progress', (data: { jobId: string; progress: number; results: string[] }) => {
      console.log('[Socket.io Event] job:progress received:', data);
      setJobsList((prevList) =>
        prevList.map((job) =>
          job.id === data.jobId
            ? {
                ...job,
                status: 'active',
                progress: data.progress,
                results: data.results
              } as any
            : job
        )
      );
    });

    /**
     * Event Handler: 'job:completed'
     * Triggered when the worker finishes processing all items successfully.
     */
    socketInstance.on('job:completed', (data: { jobId: string; results: string[] }) => {
      console.log('[Socket.io Event] job:completed received:', data);
      setJobsList((prevList) =>
        prevList.map((job) =>
          job.id === data.jobId
            ? {
                ...job,
                status: 'completed',
                progress: 100,
                results: data.results,
                completedAt: new Date().toISOString()
              } as any
            : job
        )
      );
    });

    /**
     * Event Handler: 'job:failed'
     * Triggered when the job fails (or is cancelled by the user).
     */
    socketInstance.on('job:failed', (data: { jobId: string; error: string }) => {
      console.log('[Socket.io Event] job:failed received:', data);
      setJobsList((prevList) =>
        prevList.map((job) =>
          job.id === data.jobId
            ? {
                ...job,
                status: 'failed',
                error: data.error,
                completedAt: new Date().toISOString()
              } as any
            : job
        )
      );
    });

    /**
     * Event Handler: 'job:paused'
     * Triggered when the job is paused by a POST control.
     */
    socketInstance.on('job:paused', (data: { jobId: string }) => {
      console.log('[Socket.io Event] job:paused received:', data);
      setJobsList((prevList) =>
        prevList.map((job) =>
          job.id === data.jobId
            ? {
                ...job,
                status: 'paused'
              } as any
            : job
        )
      );
    });

    /**
     * Event Handler: 'job:resumed'
     * Triggered when the job is resumed back to active processing.
     */
    socketInstance.on('job:resumed', (data: { jobId: string }) => {
      console.log('[Socket.io Event] job:resumed received:', data);
      setJobsList((prevList) =>
        prevList.map((job) =>
          job.id === data.jobId
            ? {
                ...job,
                status: 'active'
              } as any
            : job
        )
      );
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket.io Hook] Disconnected from socket server.');
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [jobsList, setJobsList]);

  /**
   * watchJob:
   * Direct method to manually request a subscription room for a newly created job.
   */
  const watchJob = useCallback((jobId: string) => {
    if (socket && socket.connected) {
      socket.emit('join-job', jobId);
      console.log(`[Socket.io Hook] Emitted join-job for: ${jobId}`);
    } else {
      console.warn('[Socket.io Hook] Cannot join room; socket is not currently connected.');
    }
  }, [socket]);

  return { watchJob };
}
