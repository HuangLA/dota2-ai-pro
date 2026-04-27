export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'true-sight-ui-theme';

export function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
  } catch {
    return 'dark';
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(themeMode: ThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.tsTheme = themeMode;
  document.documentElement.style.colorScheme = themeMode;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
