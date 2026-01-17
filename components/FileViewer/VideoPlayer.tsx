/**
 * VideoPlayer Component
 * 
 * Enhanced video player with:
 * - Custom controls (play/pause, seek, volume)
 * - Playback speed control (0.5x to 2x)
 * - Fullscreen mode
 * - Progress bar with seek
 * - Skip forward/backward buttons
 * - Offline support
 */

import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    LayoutChangeEvent,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { formatFileSize } from './utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VideoPlayerProps {
  uri: string;
  fileName: string;
  fileSize?: number;
  isCached?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  onSaveToDevice?: () => void;
  onClose?: () => void;
  fullscreen?: boolean;
  isOnline?: boolean;
}

// Format time in mm:ss or hh:mm:ss
const formatTime = (millis: number): string => {
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  fullscreen: initialFullscreen = false,
  isOnline = true,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [progressSliderWidth, setProgressSliderWidth] = useState(0);
  
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLocal = isCached || uri.startsWith('file://');
  
  // Extract status values
  const isLoaded = status?.isLoaded ?? false;
  const isPlaying = isLoaded && (status as any)?.isPlaying;
  const position = isLoaded ? (status as any)?.positionMillis ?? 0 : 0;
  const duration = isLoaded ? (status as any)?.durationMillis ?? 0 : 0;
  const playbackRate = isLoaded ? (status as any)?.rate ?? 1 : 1;
  const isMuted = isLoaded && (status as any)?.isMuted;

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls && isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying]);

  const toggleControls = () => {
    setShowControls(!showControls);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  };

  const togglePlayPause = async () => {
    if (!videoRef.current || !isLoaded) return;
    
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  const handleSeek = async (value: number) => {
    if (!videoRef.current || !isLoaded) return;
    await videoRef.current.setPositionAsync(value);
    setIsSeeking(false);
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  };

  const handleProgressLayout = (e: LayoutChangeEvent) => {
    setProgressSliderWidth(e.nativeEvent.layout.width);
  };

  const skipForward = async () => {
    if (!videoRef.current || !isLoaded) return;
    const newPosition = Math.min(position + 10000, duration);
    await videoRef.current.setPositionAsync(newPosition);
  };

  const skipBackward = async () => {
    if (!videoRef.current || !isLoaded) return;
    const newPosition = Math.max(position - 10000, 0);
    await videoRef.current.setPositionAsync(newPosition);
  };

  const changePlaybackRate = async (rate: number) => {
    if (!videoRef.current || !isLoaded) return;
    await videoRef.current.setRateAsync(rate, true);
    setShowSpeedMenu(false);
  };

  const toggleMute = async () => {
    if (!videoRef.current || !isLoaded) return;
    await videoRef.current.setIsMutedAsync(!isMuted);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handlePlaybackStatusUpdate = (newStatus: AVPlaybackStatus) => {
    setStatus(newStatus);
    
    if (newStatus.isLoaded) {
      setIsBuffering(newStatus.isBuffering ?? false);
      setHasError(false);
      
      // Auto-replay at end
      if (newStatus.didJustFinish) {
        videoRef.current?.setPositionAsync(0);
      }
    } else if ((newStatus as any).error) {
      setHasError(true);
      console.error('Video playback error:', (newStatus as any).error);
    }
  };

  const renderControls = (isFullscreenMode: boolean = false) => (
    (() => {
      const progressPercent = duration > 0
        ? Math.max(0, Math.min(100, (position / duration) * 100))
        : 0;

      return (
    <View style={[
      styles.controlsOverlay,
      isFullscreenMode && styles.fullscreenControlsOverlay,
      !showControls && styles.hiddenControls
    ]}>
      {/* Top bar */}
      <View style={[styles.topBar, isFullscreenMode && styles.fullscreenTopBar]}>
        {isFullscreenMode && (
          <TouchableOpacity onPress={toggleFullscreen} style={styles.controlButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={[styles.videoTitle, isFullscreenMode && styles.fullscreenTitle]} numberOfLines={1}>
          {fileName}
        </Text>
        <View style={styles.topBarActions}>
          {onShare && (
            <TouchableOpacity onPress={onShare} style={styles.controlButton}>
              <Ionicons name="share-outline" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Center controls */}
      <View style={styles.centerControls}>
        <TouchableOpacity onPress={skipBackward} style={styles.skipButton}>
          <Ionicons name="play-back" size={32} color="#fff" />
          <Text style={styles.skipText}>10s</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
          {isBuffering ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons name={isPlaying ? "pause" : "play"} size={48} color="#fff" />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={skipForward} style={styles.skipButton}>
          <Ionicons name="play-forward" size={32} color="#fff" />
          <Text style={styles.skipText}>10s</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, isFullscreenMode && styles.fullscreenBottomBar]}>
        {/* Progress slider - Custom implementation */}
        <View style={styles.progressContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <TouchableOpacity
            style={styles.progressSlider}
            activeOpacity={1}
            onLayout={handleProgressLayout}
            onPress={(e) => {
              const { locationX } = e.nativeEvent;
              const sliderWidth = progressSliderWidth || 1;
              const newPosition = (locationX / sliderWidth) * duration;
              handleSeek(Math.max(0, Math.min(newPosition, duration)));
            }}
          >
            <View style={styles.progressTrack}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${progressPercent}%` }
                ]} 
              />
              <View 
                style={[
                  styles.progressThumb,
                  { left: `${progressPercent}%` }
                ]}
              />
            </View>
          </TouchableOpacity>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        {/* Bottom actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity onPress={toggleMute} style={styles.controlButton}>
            <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowSpeedMenu(true)} style={styles.speedButton}>
            <Text style={styles.speedText}>{playbackRate}x</Text>
          </TouchableOpacity>

          {!isFullscreenMode && (
            <TouchableOpacity onPress={toggleFullscreen} style={styles.controlButton}>
              <Ionicons name="expand" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Speed menu */}
      {showSpeedMenu && (
        <View style={styles.speedMenu}>
          <Text style={styles.speedMenuTitle}>Playback Speed</Text>
          <View style={styles.speedOptions}>
            {PLAYBACK_RATES.map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  styles.speedOption,
                  playbackRate === rate && styles.speedOptionActive
                ]}
                onPress={() => changePlaybackRate(rate)}
              >
                <Text style={[
                  styles.speedOptionText,
                  playbackRate === rate && styles.speedOptionTextActive
                ]}>
                  {rate}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity 
            style={styles.speedMenuClose} 
            onPress={() => setShowSpeedMenu(false)}
          >
            <Text style={styles.speedMenuCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
      );
    })()
  );

  const renderVideo = (containerStyle: any, videoStyle: any, isFullscreenMode: boolean = false) => {
    // Download-first: do not stream remote videos in-app
    if (!isLocal) {
      return (
        <View style={containerStyle}>
          <View style={styles.errorContainer}>
            <Ionicons name="download-outline" size={64} color="#9ca3af" />
            <Text style={styles.errorText}>Download required</Text>
            <Text style={styles.offlineHint}>Download this video to play it in the app.</Text>
            {onDownload && (
              <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
                <Ionicons name="download" size={20} color="#fff" />
                <Text style={styles.downloadButtonText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity 
        style={containerStyle} 
        activeOpacity={1}
        onPress={toggleControls}
      >
        {hasError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="videocam-off" size={64} color="#9ca3af" />
            <Text style={styles.errorText}>Failed to load video</Text>
            <Text style={styles.offlineHint}>
              This video file may be corrupted or in an unsupported format
            </Text>
            {!isLocal && onDownload && (
              <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <Video
              ref={videoRef}
              source={{ uri }}
              style={videoStyle}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              useNativeControls={false}
              onError={(error) => {
                console.error('Video error:', error);
                setHasError(true);
              }}
            />
            {renderControls(isFullscreenMode)}
          </>
        )}
      </TouchableOpacity>
    );
  };

  // Inline viewer
  const renderInlineViewer = () => (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="videocam" size={20} color="#ea4335" />
          <Text style={styles.headerTitle} numberOfLines={1}>{fileName}</Text>
        </View>
        <View style={styles.headerActions}>
          {onDownload && !isLocal && (
            <TouchableOpacity style={styles.headerButton} onPress={onDownload}>
              <Ionicons name="download-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Video Container */}
      {renderVideo(styles.videoContainer, styles.video, false)}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          {isLocal ? (
            <View style={styles.cachedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.cachedText}>Available offline</Text>
            </View>
          ) : (
            <View style={styles.onlineBadge}>
              <Ionicons name="download-outline" size={14} color="#6b7280" />
              <Text style={styles.onlineText}>Download required</Text>
            </View>
          )}
          {fileSize && (
            <Text style={styles.fileSizeText}>{formatFileSize(fileSize)}</Text>
          )}
          {duration > 0 && (
            <Text style={styles.durationText}>{formatTime(duration)}</Text>
          )}
        </View>
      </View>
    </View>
  );

  // Fullscreen modal
  const renderFullscreenViewer = () => (
    <Modal
      visible={isFullscreen}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={toggleFullscreen}
    >
      <StatusBar hidden />
      {renderVideo(styles.fullscreenContainer, styles.fullscreenVideo, true)}
    </Modal>
  );

  return (
    <>
      {renderInlineViewer()}
      {renderFullscreenViewer()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#1a1a1a',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
  },
  fullscreenControlsOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  hiddenControls: {
    opacity: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  fullscreenTopBar: {
    paddingTop: 44,
  },
  videoTitle: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    marginHorizontal: 8,
  },
  fullscreenTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(234, 67, 53, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButton: {
    alignItems: 'center',
    padding: 8,
  },
  skipText: {
    fontSize: 12,
    color: '#fff',
    marginTop: 2,
  },
  bottomBar: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  fullscreenBottomBar: {
    paddingBottom: 32,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressSlider: {
    flex: 1,
    marginHorizontal: 8,
    height: 30,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ea4335',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    backgroundColor: '#ea4335',
    borderRadius: 8,
    marginLeft: -8,
  },
  timeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
    minWidth: 45,
    textAlign: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  controlButton: {
    padding: 8,
  },
  speedButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  speedText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  speedMenu: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.95)',
    borderRadius: 12,
    padding: 16,
    minWidth: 160,
  },
  speedMenuTitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  speedOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  speedOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  speedOptionActive: {
    backgroundColor: '#ea4335',
  },
  speedOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  speedOptionTextActive: {
    fontWeight: '700',
  },
  speedMenuClose: {
    marginTop: 12,
    alignItems: 'center',
  },
  speedMenuCloseText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1a1a1a',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  offlineHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ea4335',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    padding: 12,
    backgroundColor: '#1a1a1a',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 163, 74, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  cachedText: {
    fontSize: 12,
    color: '#4ade80',
    fontWeight: '500',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  onlineText: {
    fontSize: 12,
    color: '#60a5fa',
    fontWeight: '500',
  },
  fileSizeText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  durationText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  // Fullscreen styles
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenVideo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
