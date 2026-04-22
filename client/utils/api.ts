const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const getConfiguredBaseUrl = (): string => {
  const explicitBaseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim();

  if (explicitBaseUrl) {
    return trimTrailingSlash(explicitBaseUrl);
  }

  // Web 调试时优先走当前站点的相对路径，让 Metro 的 /api 代理生效。
  if (typeof window !== 'undefined') {
    return '';
  }

  return 'http://localhost:9091';
};

export const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getConfiguredBaseUrl()}${normalizedPath}`;
};
