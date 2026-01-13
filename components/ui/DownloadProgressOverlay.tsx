/**
 * DownloadProgressOverlay Component
 * 
 * Full screen overlay showing download progress with animation
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DownloadProgressOverlayProps {
  visible: boolean;
  progress: number; // 0 to 1
  fileName: string;
  fileSize?: string;
  downloadedSize?: string;
  onCancel?: () => void;
  status?: 'downloading' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
}

export default function DownloadProgressOverlay({
  visible,
  progress,
  fileName,
  fileSize,
  downloadedSize,
  onCancel,
  status = 'downloading',
  errorMessage,
}: DownloadProgressOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'downloading' || status === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (status === 'complete') {
      Animated.spring(checkmarkScale, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      checkmarkScale.setValue(0);
    }
  }, [status]);

  const getStatusIcon = () => {
    switch (status) {
      case 'downloading':
        return 'cloud-download';
      case 'processing':
        return 'hourglass';
      case 'complete':
        return 'checkmark-circle';
      case 'error':
        return 'alert-circle';
      default:
        return 'cloud-download';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'downloading':
      case 'processing':
        return '#1967d2';
      case 'complete':
        return '#16a34a';
      case 'error':
        return '#ef4444';
      default:
        return '#1967d2';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'downloading':
        return 'Downloading...';
      case 'processing':
        return 'Processing...';
      case 'complete':
        return 'Download Complete!';
      case 'error':
        return 'Download Failed';
      default:
        return 'Downloading...';
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Icon */}
          <Animated.View
            style={[
              styles.iconContainer,
              { 
                backgroundColor: `${getStatusColor()}15`,
                transform: [{ scale: status === 'complete' ? checkmarkScale : pulseAnim }]
              }
            ]}
          >
            <Ionicons
              name={getStatusIcon()}
              size={48}
              color={getStatusColor()}
            />
          </Animated.View>

          {/* Status text */}
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>

          {/* File name */}
          <Text style={styles.fileName} numberOfLines={2}>
            {fileName}
          </Text>

          {/* Progress section */}
          {(status === 'downloading' || status === 'processing') && (
            <>
              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      { width: progressWidth, backgroundColor: getStatusColor() }
                    ]}
                  />
                </View>
                <Text style={styles.progressPercent}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>

              {/* Size info */}
              {(fileSize || downloadedSize) && (
                <Text style={styles.sizeText}>
                  {downloadedSize || '0 KB'} / {fileSize || 'Unknown'}
                </Text>
              )}
            </>
          )}

          {/* Error message */}
          {status === 'error' && errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {(status === 'downloading' || status === 'processing') && onCancel && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#ef4444" />
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
            {status === 'error' && onCancel && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#6b7280" />
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  fileName: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  progressContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    width: 45,
    textAlign: 'right',
  },
  sizeText: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  actions: {
    marginTop: 8,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    gap: 8,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    gap: 8,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
});
