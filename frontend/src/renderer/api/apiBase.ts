interface LocationLike {
  protocol?: string;
  hostname?: string;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

function normalizeConfiguredBaseUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

export function deriveApiBaseUrl(options?: {
  configuredBaseUrl?: string | null;
  location?: LocationLike | null;
}): string {
  const configuredBaseUrl = normalizeConfiguredBaseUrl(options?.configuredBaseUrl);
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const location = options?.location;
  if (
    location?.hostname &&
    (location.protocol === 'http:' || location.protocol === 'https:')
  ) {
    return `${location.protocol}//${location.hostname}:8000`;
  }

  return DEFAULT_API_BASE_URL;
}

export function getApiBaseUrl(): string {
  const browserLocation =
    typeof window !== 'undefined' && window.location ? window.location : undefined;

  return deriveApiBaseUrl({
    configuredBaseUrl: import.meta.env.VITE_API_BASE_URL,
    location: browserLocation,
  });
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export function getApiDocsUrl(): string {
  return buildApiUrl('/docs');
}
