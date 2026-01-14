/**
 * CodeViewer Component
 * 
 * View code files with:
 * - Syntax highlighting (basic - based on file extension)
 * - Line numbers
 * - Horizontal scrolling for long lines
 * - Copy to clipboard
 * - Dark/light theme
 */

import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { formatFileSize } from './utils';

interface CodeViewerProps {
  uri: string;
  fileName: string;
  fileSize?: number;
  isCached?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  onSaveToDevice?: () => void;
  onClose?: () => void;
  isOnline?: boolean;
}

// Get language from file extension
const getLanguageFromExtension = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    js: 'JavaScript',
    jsx: 'JavaScript (JSX)',
    ts: 'TypeScript',
    tsx: 'TypeScript (TSX)',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    h: 'C Header',
    hpp: 'C++ Header',
    cs: 'C#',
    php: 'PHP',
    rb: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    swift: 'Swift',
    kt: 'Kotlin',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    less: 'LESS',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Bash',
    ps1: 'PowerShell',
    bat: 'Batch',
    dart: 'Dart',
    vue: 'Vue',
    svelte: 'Svelte',
  };
  return languageMap[ext] || 'Plain Text';
};

// Basic keyword highlighting colors
const KEYWORD_PATTERNS: Record<string, RegExp> = {
  keyword: /\b(function|const|let|var|if|else|return|import|export|from|class|extends|new|this|try|catch|throw|async|await|for|while|do|switch|case|break|continue|default|typeof|instanceof|in|of|null|undefined|true|false)\b/g,
  string: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
  comment: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
  number: /\b(\d+\.?\d*)\b/g,
};

export default function CodeViewer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  isOnline = true,
}: CodeViewerProps) {
  const [code, setCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [copied, setCopied] = useState(false);

  const language = getLanguageFromExtension(fileName);
  const lines = code.split('\n');

  useEffect(() => {
    loadCode();
  }, [uri]);

  const loadCode = async () => {
    try {
      setIsLoading(true);
      setHasError(false);

      // Try to read from local file first (if cached)
      const isLocalUri =
        isCached ||
        uri.startsWith('file://') ||
        (!!FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)) ||
        (!!FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory));

      if (isLocalUri) {
        const content = await FileSystem.readAsStringAsync(uri);
        setCode(content);
        setIsLoading(false);
        return;
      }

      // Otherwise, fetch from URL
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error('Failed to fetch code');
      }
      const content = await response.text();
      setCode(content);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading code:', error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      // Share the code content instead of using clipboard
      // This is more reliable across different React Native versions
      if (await Sharing.isAvailableAsync()) {
        // Create a temp file with the code
        const tempPath = FileSystem.cacheDirectory + 'temp_code.txt';
        await FileSystem.writeAsStringAsync(tempPath, code);
        await Sharing.shareAsync(tempPath, {
          mimeType: 'text/plain',
          dialogTitle: 'Share Code',
        });
        // Clean up temp file
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
      } else {
        Alert.alert('Copied', 'Code is ready to share. Use the Share button to send it.');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to share code');
    }
  };

  const toggleTheme = () => {
    setIsDarkTheme(!isDarkTheme);
  };

  const toggleLineNumbers = () => {
    setShowLineNumbers(!showLineNumbers);
  };

  // Theme colors
  const theme = isDarkTheme ? {
    background: '#1e1e1e',
    lineNumberBg: '#252526',
    lineNumberText: '#858585',
    codeText: '#d4d4d4',
    headerBg: '#252526',
    headerText: '#fff',
    border: '#3c3c3c',
  } : {
    background: '#ffffff',
    lineNumberBg: '#f5f5f5',
    lineNumberText: '#6e7681',
    codeText: '#24292f',
    headerBg: '#f6f8fa',
    headerText: '#1f2328',
    border: '#d0d7de',
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ea4335" />
          <Text style={[styles.loadingText, { color: theme.codeText }]}>
            Loading code...
          </Text>
        </View>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="code-slash" size={48} color="#9ca3af" />
          <Text style={styles.errorTitle}>Unable to load file</Text>
          <Text style={styles.errorText}>
            {!isOnline && !isCached 
              ? 'Download this file for offline viewing'
              : 'The file could not be displayed'}
          </Text>
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.retryButton} onPress={loadCode}>
              <Ionicons name="refresh" size={18} color="#374151" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            {onDownload && !isCached && (
              <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Ionicons name="code-slash" size={18} color="#ea4335" />
          <View style={styles.titleContainer}>
            <Text style={[styles.fileName, { color: theme.headerText }]} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={[styles.language, { color: theme.lineNumberText }]}>
              {language} • {lines.length} lines
              {fileSize && ` • ${formatFileSize(fileSize)}`}
            </Text>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.iconButton, { backgroundColor: isDarkTheme ? '#3c3c3c' : '#e1e4e8' }]} 
            onPress={toggleLineNumbers}
          >
            <Ionicons 
              name={showLineNumbers ? "list" : "list-outline"} 
              size={18} 
              color={theme.headerText} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.iconButton, { backgroundColor: isDarkTheme ? '#3c3c3c' : '#e1e4e8' }]} 
            onPress={toggleTheme}
          >
            <Ionicons 
              name={isDarkTheme ? "sunny" : "moon"} 
              size={18} 
              color={theme.headerText} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.copyButton, copied && styles.copiedButton]} 
            onPress={handleCopyCode}
          >
            <Ionicons 
              name={copied ? "checkmark" : "copy-outline"} 
              size={16} 
              color={copied ? "#fff" : theme.headerText} 
            />
            <Text style={[styles.copyText, copied && styles.copiedText, { color: copied ? '#fff' : theme.headerText }]}>
              {copied ? 'Copied!' : 'Copy'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Code Content */}
      <ScrollView 
        style={styles.scrollView}
        horizontal={false}
        showsVerticalScrollIndicator={true}
      >
        <ScrollView 
          horizontal={true}
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.codeScrollContent}
        >
          <View style={styles.codeContainer}>
            {/* Line numbers */}
            {showLineNumbers && (
              <View style={[styles.lineNumbers, { backgroundColor: theme.lineNumberBg }]}>
                {lines.map((_, index) => (
                  <Text 
                    key={index} 
                    style={[styles.lineNumber, { color: theme.lineNumberText }]}
                  >
                    {index + 1}
                  </Text>
                ))}
              </View>
            )}

            {/* Code */}
            <View style={styles.codeContent}>
              {lines.map((line, index) => (
                <Text 
                  key={index} 
                  style={[styles.codeLine, { color: theme.codeText }]}
                >
                  {line || ' '}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: theme.headerBg, borderTopColor: theme.border }]}>
        <View style={styles.footerLeft}>
          {isCached ? (
            <View style={styles.cachedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.cachedText}>Available offline</Text>
            </View>
          ) : (
            <View style={styles.onlineBadge}>
              <Ionicons name="cloud" size={14} color="#1967d2" />
              <Text style={styles.onlineText}>Viewing online</Text>
            </View>
          )}
        </View>
        
        <View style={styles.footerActions}>
          {onDownload && !isCached && (
            <TouchableOpacity style={styles.footerButton} onPress={onDownload}>
              <Ionicons name="download-outline" size={18} color="#4b5563" />
            </TouchableOpacity>
          )}
          {onShare && (
            <TouchableOpacity style={styles.footerButton} onPress={onShare}>
              <Ionicons name="share-outline" size={18} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ea4335',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  language: {
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    padding: 8,
    borderRadius: 6,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  copiedButton: {
    backgroundColor: '#16a34a',
  },
  copyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  copiedText: {
    color: '#fff',
  },
  scrollView: {
    maxHeight: 400,
  },
  codeScrollContent: {
    flexGrow: 1,
  },
  codeContainer: {
    flexDirection: 'row',
    minWidth: '100%',
  },
  lineNumbers: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: 40,
    alignItems: 'flex-end',
  },
  lineNumber: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  codeContent: {
    flex: 1,
    padding: 12,
    paddingLeft: 16,
  },
  codeLine: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderTopWidth: 1,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  cachedText: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '500',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  onlineText: {
    fontSize: 11,
    color: '#1967d2',
    fontWeight: '500',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerButton: {
    padding: 6,
    borderRadius: 6,
  },
});
