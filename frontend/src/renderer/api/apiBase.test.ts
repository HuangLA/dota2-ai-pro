import { describe, expect, it } from 'vitest';

import { deriveApiBaseUrl } from './apiBase';

describe('deriveApiBaseUrl', () => {
  it('prefers an explicit configured base URL', () => {
    expect(
      deriveApiBaseUrl({
        configuredBaseUrl: 'http://localhost:9000/',
        location: { protocol: 'http:', hostname: '127.0.0.1' },
      })
    ).toBe('http://localhost:9000');
  });

  it('follows the current browser hostname for http dev sessions', () => {
    expect(
      deriveApiBaseUrl({
        location: { protocol: 'http:', hostname: '127.0.0.1' },
      })
    ).toBe('http://127.0.0.1:8000');
  });

  it('falls back to the default local API host outside browser http contexts', () => {
    expect(
      deriveApiBaseUrl({
        location: { protocol: 'app:', hostname: '' },
      })
    ).toBe('http://127.0.0.1:8000');
  });
});
