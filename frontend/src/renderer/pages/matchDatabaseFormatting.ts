export type DownloadStatusVisual =
  | 'pending'
  | 'prepared'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface DownloadStatusMeta {
  key: DownloadStatusVisual;
  label: string;
  className: string;
}

export const DOWNLOAD_STATUS_META: Record<DownloadStatusVisual, DownloadStatusMeta> = {
  pending: {
    key: 'pending',
    label: '等待中',
    className: 'bg-amber-900/40 border-amber-600/70 text-amber-200',
  },
  prepared: {
    key: 'prepared',
    label: '已准备',
    className: 'bg-blue-900/40 border-blue-600/70 text-blue-200',
  },
  downloading: {
    key: 'downloading',
    label: '下载中',
    className: 'bg-cyan-900/40 border-cyan-600/70 text-cyan-200',
  },
  completed: {
    key: 'completed',
    label: '已完成',
    className: 'bg-green-900/40 border-green-600/70 text-green-200',
  },
  failed: {
    key: 'failed',
    label: '失败',
    className: 'bg-red-900/40 border-red-600/70 text-red-200',
  },
  unknown: {
    key: 'unknown',
    label: '未知',
    className: 'bg-gray-800 border-gray-600 text-gray-200',
  },
};

export function normalizeDownloadStatus(status?: string | null): DownloadStatusVisual {
  if (!status) {
    return 'unknown';
  }

  if (
    status === 'pending' ||
    status === 'prepared' ||
    status === 'downloading' ||
    status === 'completed' ||
    status === 'failed'
  ) {
    return status;
  }

  return 'unknown';
}

export function getDownloadStatusMeta(status?: string | null): DownloadStatusMeta {
  return DOWNLOAD_STATUS_META[normalizeDownloadStatus(status)];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDurationClock(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) {
    return '--';
  }

  const safeValue = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const remainSeconds = safeValue % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(remainSeconds)}`;
  }

  return `${pad(minutes)}:${pad(remainSeconds)}`;
}

export function formatUnixTimestampLocal(timestamp?: number | null): string {
  if (timestamp === undefined || timestamp === null) {
    return '--';
  }

  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
