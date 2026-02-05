import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // File operations
  selectReplayFile: () => ipcRenderer.invoke('select-replay-file'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  // Backend communication
  sendToBackend: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
  onBackendMessage: (channel: string, callback: (data: unknown) => void) => {
    ipcRenderer.on(channel, (_event, data) => callback(data));
  },
  
  // Platform info
  platform: process.platform,
});

// Type definitions for renderer
declare global {
  interface Window {
    electronAPI: {
      getAppPath: () => Promise<string>;
      getVersion: () => Promise<string>;
      selectReplayFile: () => Promise<string | null>;
      selectDirectory: () => Promise<string | null>;
      sendToBackend: (channel: string, data: unknown) => void;
      onBackendMessage: (channel: string, callback: (data: unknown) => void) => void;
      platform: NodeJS.Platform;
    };
  }
}
