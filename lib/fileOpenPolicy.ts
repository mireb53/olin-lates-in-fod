export type OfflineOpenMode = 'in-app' | 'in-app-truncated' | 'external';

export interface OfflineOpenPolicy {
  mode: OfflineOpenMode;
  supportedInApp: boolean;
  prefersExternal: boolean;
  subtitle: string;
}

const getFileExtension = (nameOrPath: string): string => {
  const base = (nameOrPath || '').split('?')[0].split('#')[0];
  const ext = base.split('.').pop()?.toLowerCase();
  if (!ext || ext === base.toLowerCase()) return '';
  return ext;
};

export const isOfficeExtension = (extension?: string): boolean => {
  const ext = (extension || '').toLowerCase();
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
};

export const isOfficeFileName = (nameOrPath: string): boolean => isOfficeExtension(getFileExtension(nameOrPath));

export const getOfflineOpenPolicy = (opts: {
  fileName: string;
  fileSizeBytes?: number;
  largeTextThresholdBytes?: number;
}): OfflineOpenPolicy => {
  const fileName = opts.fileName || '';
  const ext = getFileExtension(fileName);
  const sizeBytes = opts.fileSizeBytes;
  const largeTextThresholdBytes = opts.largeTextThresholdBytes ?? 1024 * 1024;

  if (isOfficeExtension(ext)) {
    return {
      mode: 'external',
      supportedInApp: false,
      prefersExternal: true,
      subtitle: 'Opens in another app (Word/Excel/PowerPoint).',
    };
  }

  // Common in-app supported formats
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) {
    return {
      mode: 'in-app',
      supportedInApp: true,
      prefersExternal: false,
      subtitle: 'Viewable in the app after download.',
    };
  }

  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v', 'flv', 'wmv'].includes(ext)) {
    return {
      mode: 'in-app',
      supportedInApp: true,
      prefersExternal: false,
      subtitle: 'Playable in the app after download.',
    };
  }

  if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'opus'].includes(ext)) {
    return {
      mode: 'in-app',
      supportedInApp: true,
      prefersExternal: false,
      subtitle: 'Playable in the app after download.',
    };
  }

  if (ext === 'pdf') {
    return {
      mode: 'in-app',
      supportedInApp: true,
      prefersExternal: false,
      subtitle: 'Viewable in the app after download.',
    };
  }

  const isTextLike = [
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb',
    'go', 'rs', 'swift', 'kt', 'dart', 'html', 'css', 'scss', 'less', 'json',
    'xml', 'yaml', 'yml', 'sql', 'sh', 'bash', 'md', 'txt', 'log', 'ini', 'conf',
    'env',
  ].includes(ext);

  if (isTextLike) {
    const isLarge = typeof sizeBytes === 'number' && sizeBytes > largeTextThresholdBytes;
    if (isLarge) {
      return {
        mode: 'in-app-truncated',
        supportedInApp: true,
        prefersExternal: false,
        subtitle: 'Large text file: app will show a partial preview after download.',
      };
    }

    return {
      mode: 'in-app',
      supportedInApp: true,
      prefersExternal: false,
      subtitle: 'Viewable in the app after download.',
    };
  }

  return {
    mode: 'external',
    supportedInApp: false,
    prefersExternal: true,
    subtitle: 'Not viewable in-app. Download then open in another app.',
  };
};
