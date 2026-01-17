/**
 * AudioPlayer Component
 * 
 * Enhanced audio player with:
 * - Visual waveform/progress indicator
 * - Play/pause controls
 * - Seek functionality with slider
 * - Skip forward/backward (15s)
 * - Playback speed control
 * - Volume control
 * - Background playback support
 * - Offline support
 */

import { Ionicons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { formatFileSize } from './utils';

interface AudioPlayerProps {
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

// Format time in mm:ss
const formatTime = (millis: number): string => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Generate fake waveform bars for visualization
const generateWaveformBars = (count: number): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Create a varied pattern
    bars.push(0.3 + Math.random() * 0.7);
  }
  return bars;
};

export default function AudioPlayer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  isOnline = true,
}: AudioPlayerProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [waveformBars] = useState(() => generateWaveformBars(40));
  
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isLocal = isCached || uri.startsWith('file://');

  // Extract status values
  const isLoaded = status?.isLoaded ?? false;
  const isPlaying = isLoaded && (status as any)?.isPlaying;
  const position = isLoaded ? (status as any)?.positionMillis ?? 0 : 0;
  const duration = isLoaded ? (status as any)?.durationMillis ?? 1 : 1;
  const playbackRate = isLoaded ? (status as any)?.rate ?? 1 : 1;
  const volume = isLoaded ? (status as any)?.volume ?? 1 : 1;
  const isBuffering = isLoaded && (status as any)?.isBuffering;

  const progress = duration > 0 ? position / duration : 0;

  // Pulse animation when playing
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isPlaying]);

  // Initialize audio (download-first: local files only)
  useEffect(() => {
    if (!isLocal) {
      setIsLoading(false);
      setHasError(false);
      return;
    }

    loadAudio();

    return () => {
      unloadAudio();
    };
  }, [uri, isLocal]);

  const loadAudio = async () => {
    try {
      setIsLoading(true);
      setHasError(false);

      // Configure audio mode for background playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        handlePlaybackStatusUpdate
      );
      
      soundRef.current = sound;
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading audio:', error);
      setHasError(true);
      setIsLoading(false);
    }
  };

  const unloadAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  };

  const handlePlaybackStatusUpdate = (newStatus: AVPlaybackStatus) => {
    setStatus(newStatus);
    
    if (newStatus.isLoaded) {
      setHasError(false);
      
      // Loop or stop at end
      if (newStatus.didJustFinish) {
        soundRef.current?.setPositionAsync(0);
      }
    } else if ((newStatus as any).error) {
      setHasError(true);
      console.error('Audio playback error:', (newStatus as any).error);
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current || !isLoaded) return;
    
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  };

  const handleSeek = async (value: number) => {
    if (!soundRef.current || !isLoaded) return;
    await soundRef.current.setPositionAsync(value);
    setIsSeeking(false);
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const skipForward = async () => {
    if (!soundRef.current || !isLoaded) return;
    const newPosition = Math.min(position + 15000, duration);
    await soundRef.current.setPositionAsync(newPosition);
  };

  const skipBackward = async () => {
    if (!soundRef.current || !isLoaded) return;
    const newPosition = Math.max(position - 15000, 0);
    await soundRef.current.setPositionAsync(newPosition);
  };

  const changePlaybackRate = async (rate: number) => {
    if (!soundRef.current || !isLoaded) return;
    await soundRef.current.setRateAsync(rate, true);
    setShowSpeedMenu(false);
  };

  const handleVolumeChange = async (value: number) => {
    if (!soundRef.current || !isLoaded) return;
    await soundRef.current.setVolumeAsync(value);
  };

  // Render waveform visualization
  const renderWaveform = () => (
    <View style={styles.waveformContainer}>
      {waveformBars.map((height, index) => {
        const barProgress = index / waveformBars.length;
        const isActive = barProgress <= progress;
        
        return (
          <View
            key={index}
            style={[
              styles.waveformBar,
              {
                height: `${height * 100}%`,
                backgroundColor: isActive ? '#ea4335' : '#374151',
              },
            ]}
          />
        );
      })}
    </View>
  );

  if (!isLocal) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="download-outline" size={48} color="#9ca3af" />
          <Text style={styles.errorText}>Download required</Text>
          <Text style={styles.offlineHint}>Download this audio to play it in the app.</Text>
          {onDownload && (
            <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
              <Ionicons name="download" size={18} color="#fff" />
              <Text style={styles.downloadButtonText}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ea4335" />
          <Text style={styles.loadingText}>Loading audio...</Text>
        </View>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="musical-notes-outline" size={48} color="#9ca3af" />
          <Text style={styles.errorText}>Failed to load audio</Text>
          <Text style={styles.offlineHint}>
            {isCached 
              ? 'This audio file may be corrupted or in an unsupported format'
              : !isOnline 
                ? 'Download this audio for offline listening'
                : 'Unable to stream audio. Try downloading it.'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadAudio}>
            <Ionicons name="refresh" size={18} color="#374151" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          {!isLocal && onDownload && (
            <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
              <Ionicons name="download" size={18} color="#fff" />
              <Text style={styles.downloadButtonText}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={[styles.iconContainer, isPlaying && styles.iconPlaying]}>
              <Ionicons 
                name={isPlaying ? "musical-notes" : "musical-note"} 
                size={24} 
                color={isPlaying ? "#fff" : "#ea4335"} 
              />
            </View>
          </Animated.View>
          <View style={styles.titleContainer}>
            <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
            <Text style={styles.fileInfo}>
              {fileSize ? formatFileSize(fileSize) : ''} 
              {fileSize && duration > 0 ? ' • ' : ''}
              {duration > 0 ? formatTime(duration) : ''}
            </Text>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          {onDownload && !isCached && (
            <TouchableOpacity style={styles.headerButton} onPress={onDownload}>
              <Ionicons name="download-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          )}
          {onShare && (
            <TouchableOpacity style={styles.headerButton} onPress={onShare}>
              <Ionicons name="share-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Waveform visualization */}
      <View style={styles.waveformWrapper}>
        {renderWaveform()}
      </View>

      {/* Progress bar - Custom implementation */}
      <View style={styles.progressContainer}>
        <TouchableOpacity
          style={styles.progressSlider}
          activeOpacity={1}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            const sliderWidth = 300; // Approximate width
            const newPosition = (locationX / sliderWidth) * duration;
            handleSeek(Math.max(0, Math.min(newPosition, duration)));
          }}
        >
          <View style={styles.progressTrack}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(position / duration) * 100}%` }
              ]} 
            />
            <View 
              style={[
                styles.progressThumb,
                { left: `${(position / duration) * 100}%` }
              ]}
            />
          </View>
        </TouchableOpacity>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Main controls */}
      <View style={styles.mainControls}>
        {/* Skip backward */}
        <TouchableOpacity style={styles.skipButton} onPress={skipBackward}>
          <Ionicons name="play-back" size={28} color="#374151" />
          <Text style={styles.skipText}>15</Text>
        </TouchableOpacity>

        {/* Play/Pause */}
        <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
          {isBuffering ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={32} 
              color="#fff" 
            />
          )}
        </TouchableOpacity>

        {/* Skip forward */}
        <TouchableOpacity style={styles.skipButton} onPress={skipForward}>
          <Ionicons name="play-forward" size={28} color="#374151" />
          <Text style={styles.skipText}>15</Text>
        </TouchableOpacity>
      </View>

      {/* Secondary controls */}
      <View style={styles.secondaryControls}>
        {/* Volume - Custom implementation */}
        <View style={styles.volumeContainer}>
          <Ionicons name="volume-low" size={18} color="#6b7280" />
          <TouchableOpacity
            style={styles.volumeSlider}
            activeOpacity={1}
            onPress={(e) => {
              const { locationX } = e.nativeEvent;
              const sliderWidth = 120; // Approximate width
              const newVolume = Math.max(0, Math.min(locationX / sliderWidth, 1));
              handleVolumeChange(newVolume);
            }}
          >
            <View style={styles.volumeTrack}>
              <View 
                style={[
                  styles.volumeFill, 
                  { width: `${volume * 100}%` }
                ]} 
              />
            </View>
          </TouchableOpacity>
          <Ionicons name="volume-high" size={18} color="#6b7280" />
        </View>

        {/* Speed */}
        <TouchableOpacity 
          style={styles.speedButton}
          onPress={() => setShowSpeedMenu(!showSpeedMenu)}
        >
          <Text style={styles.speedButtonText}>{playbackRate}x</Text>
          <Ionicons name="chevron-down" size={14} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Speed menu */}
      {showSpeedMenu && (
        <View style={styles.speedMenu}>
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
      )}

      {/* Status badge */}
      <View style={styles.footer}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 14,
  },
  errorContainer: {
    padding: 32,
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    color: '#9ca3af',
    fontSize: 14,
  },
  offlineHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: '#ea4335',
    borderRadius: 20,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  downloadButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1967d2',
    borderRadius: 20,
  },
  downloadButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconPlaying: {
    backgroundColor: '#ea4335',
  },
  titleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  fileInfo: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  waveformWrapper: {
    height: 60,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressSlider: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ea4335',
    borderRadius: 3,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    backgroundColor: '#ea4335',
    borderRadius: 8,
    marginLeft: -8,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  timeText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  mainControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ea4335',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  skipButton: {
    alignItems: 'center',
    padding: 8,
  },
  skipText: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
    fontWeight: '600',
  },
  secondaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  volumeContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  volumeSlider: {
    flex: 1,
    marginHorizontal: 8,
    height: 24,
    justifyContent: 'center',
  },
  volumeTrack: {
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    position: 'relative',
  },
  volumeFill: {
    height: '100%',
    backgroundColor: '#6b7280',
    borderRadius: 2,
  },
  speedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  speedButtonText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  speedMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  speedOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  speedOptionActive: {
    backgroundColor: '#ea4335',
    borderColor: '#ea4335',
  },
  speedOptionText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
  },
  speedOptionTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  cachedText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  onlineText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '600',
  },
});
