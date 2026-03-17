import axios from 'axios';
import { buildApiUrl } from './apiBase';

export interface UploadResponse {
  status: string;
  filename: string;
  replay_path: string;
  task_id: string;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ParseTask {
  task_id: string;
  status: TaskStatus;
  replay_path: string;
  progress: number;
  error?: string;
  match_id?: number;
  created_at: number;
  started_at?: number;
  completed_at?: number;
}

export interface ParseTasksResponse {
  tasks: ParseTask[];
  total: number;
  limit: number;
  offset: number;
}

export const replayService = {
  /**
   * Upload a .dem replay file for parsing
   */
  async uploadReplay(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post<UploadResponse>(
      buildApiUrl('/api/v1/replays/upload'),
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Get list of parse tasks
   */
  async getParseTasks(limit: number = 20, offset: number = 0): Promise<ParseTasksResponse> {
    const response = await axios.get<ParseTasksResponse>(
      buildApiUrl('/api/v1/replays/tasks'),
      {
        params: {
          limit,
          offset,
        },
      }
    );
    return response.data;
  },

  /**
   * Get a specific parse task
   */
  async getParseTask(taskId: string): Promise<ParseTask> {
    const response = await axios.get<ParseTask>(
      buildApiUrl(`/api/v1/replays/tasks/${taskId}`)
    );
    return response.data;
  },

  /**
   * Create a new parse task for an existing replay file
   */
  async createParseTask(replayPath: string): Promise<ParseTask> {
    const response = await axios.post<ParseTask>(
      buildApiUrl('/api/v1/replays/parse'),
      {
        replay_path: replayPath,
      }
    );
    return response.data;
  },
};
