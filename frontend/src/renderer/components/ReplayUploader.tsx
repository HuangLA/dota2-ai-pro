import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { replayService, ParseTask, TaskStatus } from '../api/replayService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ReplayUploaderProps {
  onTaskCompleted?: () => void;
}

export function ReplayUploader({ onTaskCompleted }: ReplayUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tasks, setTasks] = useState<ParseTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Track previous statuses to trigger onTaskCompleted
  const prevTaskStatusesRef = useRef<Record<string, TaskStatus>>({});
  
  // Use a ref for the callback to keep fetchTasks stable and avoid resetting the polling interval
  const onTaskCompletedRef = useRef(onTaskCompleted);
  
  useEffect(() => {
    onTaskCompletedRef.current = onTaskCompleted;
  }, [onTaskCompleted]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      // Get recent tasks, maybe limit to 5 or 10
      const response = await replayService.getParseTasks(5, 0);
      const newTasks = response.tasks;
      
      // Check for completions
      let shouldTriggerCompletion = false;
      const currentStatuses: Record<string, TaskStatus> = {};
      
      newTasks.forEach(task => {
        currentStatuses[task.task_id] = task.status;
        
        const prevStatus = prevTaskStatusesRef.current[task.task_id];
        
        // If we were tracking this task and it wasn't completed before, but is now
        if (prevStatus && prevStatus !== 'completed' && task.status === 'completed') {
          shouldTriggerCompletion = true;
        }
      });
      
      prevTaskStatusesRef.current = currentStatuses;
      setTasks(newTasks);
      
      if (shouldTriggerCompletion && onTaskCompletedRef.current) {
        onTaskCompletedRef.current();
      }
      
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Handle file upload
  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.dem')) {
      setError('Invalid file type. Please upload a .dem file.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await replayService.uploadReplay(file);
      // Immediately fetch tasks to show the new one
      await fetchTasks();
    } catch (err) {
      console.error('Upload failed', err);
      setError('Failed to upload replay. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full mb-8">
      {/* Upload Area */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-10 transition-all duration-200 text-center cursor-pointer",
          dragActive 
            ? "border-dota-primary bg-dota-primary/10 scale-[1.02]" 
            : "border-gray-600 hover:border-dota-primary hover:bg-white/5",
          uploading && "opacity-50 pointer-events-none"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('replay-upload-input')?.click()}
      >
        <input
          id="replay-upload-input"
          type="file"
          className="hidden"
          accept=".dem"
          onChange={handleChange}
          disabled={uploading}
        />
        
        <div className="flex flex-col items-center justify-center gap-3">
          <div className={cn(
            "p-4 rounded-full transition-colors",
            dragActive ? "bg-dota-primary/20" : "bg-gray-800"
          )}>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={cn(
                "h-12 w-12 transition-colors",
                dragActive ? "text-dota-primary" : "text-gray-400"
              )}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          
          <div className="text-xl font-semibold text-gray-200">
            {uploading ? 'Uploading replay...' : dragActive ? 'Drop replay here' : 'Upload Replay File'}
          </div>
          <div className="text-sm text-gray-400">
            {uploading ? 'Please wait...' : 'Drag and drop a .dem file here, or click to browse'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Supported format: Dota 2 Replay (.dem)
          </div>
        </div>

        {error && (
          <div className="absolute bottom-3 left-0 right-0 text-red-400 text-sm bg-red-900/20 py-2 px-4 mx-4 rounded border border-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Tasks List */}
      {tasks.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
              Recent Parsing Tasks
            </h3>
            <span className="text-xs text-gray-500">
              {tasks.filter(t => t.status === 'running').length} running, {tasks.filter(t => t.status === 'completed').length} completed
            </span>
          </div>
          <div className="bg-dota-surface rounded-lg border border-gray-700 divide-y divide-gray-800 shadow-lg">
            {tasks.map((task) => (
              <TaskItem key={task.task_id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskItem({ task }: { task: ParseTask }) {
  const fileName = task.replay_path.split(/[/\\]/).pop(); // Handle both forward and back slashes
  
  return (
    <div className="p-4 flex items-center justify-between text-sm hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <StatusIcon status={task.status} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-gray-200 truncate font-medium text-base" title={fileName}>
            {fileName}
          </span>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden max-w-[300px] border border-gray-600">
              <div 
                className={cn(
                  "h-full transition-all duration-500 ease-out",
                  task.status === 'failed' ? "bg-red-500" : 
                  task.status === 'completed' ? "bg-green-500" :
                  "bg-dota-primary"
                )}
                style={{ width: `${Math.max(5, task.progress)}%` }} // Minimum 5% visibility
              />
            </div>
            <span className="text-xs text-gray-400 w-12 text-right font-mono">
              {Math.round(task.progress)}%
            </span>
          </div>
          {task.error && (
            <span className="text-xs text-red-400 mt-2 truncate bg-red-900/20 px-2 py-1 rounded border border-red-800">
              {task.error}
            </span>
          )}
        </div>
      </div>
      
      <div className="ml-4">
        <StatusBadge status={task.status} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const config = {
    completed: { text: 'Completed', className: 'bg-green-900/50 text-green-400 border-green-700' },
    failed: { text: 'Failed', className: 'bg-red-900/50 text-red-400 border-red-700' },
    running: { text: 'Running', className: 'bg-blue-900/50 text-blue-400 border-blue-700 animate-pulse' },
    pending: { text: 'Pending', className: 'bg-gray-700 text-gray-400 border-gray-600' },
    cancelled: { text: 'Cancelled', className: 'bg-gray-700 text-gray-400 border-gray-600' },
  };
  
  const { text, className } = config[status] || config.pending;
  
  return (
    <span className={cn("text-xs font-semibold px-3 py-1.5 rounded border uppercase tracking-wide", className)}>
      {text}
    </span>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'completed':
      return (
        <div className="h-6 w-6 rounded-full bg-green-900/50 border border-green-700 flex items-center justify-center shrink-0">
          <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'failed':
      return (
        <div className="h-6 w-6 rounded-full bg-red-900/50 border border-red-700 flex items-center justify-center shrink-0">
          <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case 'running':
      return (
        <div className="h-6 w-6 rounded-full bg-blue-900/50 border border-blue-700 flex items-center justify-center shrink-0 animate-pulse">
           <svg className="h-3.5 w-3.5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      );
    default: // pending, cancelled
      return (
        <div className="h-6 w-6 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
          <div className="h-1.5 w-1.5 bg-gray-400 rounded-full" />
        </div>
      );
  }
}
