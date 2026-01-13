# FileViewer Integration Guide

This guide explains how to integrate the new FileViewer components into the Olin LMS mobile app.

## Components Created

All components are located in `components/FileViewer/`:

1. **index.tsx** - Main entry point and helper functions
   - `detectFileType(filePath)` - Auto-detect file type from extension
   - `getMimeType(filePath)` - Get MIME type string
   - `formatFileSize(bytes)` - Human-readable file size
   - `FileViewer` component - Routes to appropriate viewer

2. **ImageViewer.tsx** - Built-in image viewer
   - Pinch-to-zoom support
   - Fullscreen modal
   - Offline/online status indicators
   - Download/Share/Export actions

3. **VideoPlayer.tsx** - Enhanced video player
   - Custom controls overlay
   - Play/pause, seek, skip ±10s
   - Playback speed (0.5x to 2x)
   - Fullscreen mode
   - Progress indicator with seek

4. **AudioPlayer.tsx** - Enhanced audio player
   - Waveform visualization
   - Play/pause, seek, skip ±15s
   - Playback speed control
   - Volume slider
   - Background playback ready

5. **PDFViewer.tsx** - PDF viewer
   - Google Docs viewer for online
   - Fullscreen mode
   - Download fallback for offline

6. **CodeViewer.tsx** - Code file viewer
   - Line numbers toggle
   - Dark/light theme toggle
   - Copy to clipboard
   - Syntax detection by extension

7. **DocumentViewer.tsx** - Office documents
   - Microsoft Office Online viewer
   - Google Docs fallback
   - Support for doc, docx, xls, xlsx, ppt, pptx

8. **UnsupportedViewer.tsx** - Fallback viewer
   - File info display
   - Download and open with external app options
   - Helpful tips for users

## Quick Integration

### Basic Usage

```tsx
import FileViewer, { detectFileType } from '@/components/FileViewer';

// In your component:
<FileViewer
  type={detectFileType(material.file_path)}
  uri={fileUrl}
  fileName={material.title}
  fileSize={material.file_size}
  isCached={!!downloadedFileUri}
  isOnline={netInfo?.isInternetReachable}
  onDownload={promptDownloadOptions}
  onShare={handleShare}
  onSaveToDevice={downloadToDeviceExternal}
/>
```

### Using Individual Components

```tsx
import ImageViewer from '@/components/FileViewer/ImageViewer';
import VideoPlayer from '@/components/FileViewer/VideoPlayer';
import AudioPlayer from '@/components/FileViewer/AudioPlayer';

// For images:
<ImageViewer
  uri={imageUrl}
  fileName="photo.jpg"
  isCached={true}
  onShare={handleShare}
/>

// For videos:
<VideoPlayer
  uri={videoUrl}
  fileName="lecture.mp4"
  isCached={false}
  isOnline={true}
  onDownload={handleDownload}
/>

// For audio:
<AudioPlayer
  uri={audioUrl}
  fileName="podcast.mp3"
  fileSize={5000000}
  isCached={true}
/>
```

## Props Reference

### Common Props (all viewers)

| Prop | Type | Description |
|------|------|-------------|
| `uri` | string | File URL (local or remote) |
| `fileName` | string | Display name of the file |
| `fileSize` | number? | File size in bytes |
| `isCached` | boolean | Whether file is downloaded locally |
| `isOnline` | boolean | Whether device has internet |
| `onDownload` | function? | Called when download button pressed |
| `onShare` | function? | Called when share button pressed |
| `onSaveToDevice` | function? | Called when save to device pressed |
| `onClose` | function? | Called when close button pressed |

### VideoPlayer Additional Props

| Prop | Type | Description |
|------|------|-------------|
| `fullscreen` | boolean | Start in fullscreen mode |

### ImageViewer Additional Props

| Prop | Type | Description |
|------|------|-------------|
| `fullscreen` | boolean | Start in fullscreen mode |

## Offline Support

The FileViewer components support offline viewing:

1. **isCached=true**: Shows "Available offline" badge, allows viewing without internet
2. **isCached=false + isOnline=true**: Shows "Streaming online" badge, streams content
3. **isCached=false + isOnline=false**: Shows offline message with download prompt

## Integration Points in [materialId].tsx

Replace the existing file preview sections:

### 1. Replace Image Preview

Find the existing image rendering section and replace with:
```tsx
{fileType === 'image' && (
  <ImageViewer
    uri={downloadedFileUri || onlinePreviewUri}
    fileName={materialDetail.title}
    fileSize={/* file size */}
    isCached={!!downloadedFileUri}
    isOnline={netInfo?.isInternetReachable}
    onDownload={promptDownloadOptions}
    onShare={handleShare}
  />
)}
```

### 2. Replace Video Player

```tsx
{fileType === 'video' && (
  <VideoPlayer
    uri={downloadedFileUri || onlinePreviewUri}
    fileName={materialDetail.title}
    isCached={!!downloadedFileUri}
    isOnline={netInfo?.isInternetReachable}
    onDownload={promptDownloadOptions}
    onShare={handleShare}
  />
)}
```

### 3. Replace Audio Player

```tsx
{fileType === 'audio' && (
  <AudioPlayer
    uri={downloadedFileUri || onlinePreviewUri}
    fileName={materialDetail.title}
    isCached={!!downloadedFileUri}
    isOnline={netInfo?.isInternetReachable}
    onDownload={promptDownloadOptions}
    onShare={handleShare}
  />
)}
```

### 4. Add PDF Viewer

```tsx
{fileType === 'pdf' && (
  <PDFViewer
    uri={onlinePreviewUri}
    fileName={materialDetail.title}
    isCached={!!downloadedFileUri}
    isOnline={netInfo?.isInternetReachable}
    onDownload={promptDownloadOptions}
    onShare={handleShare}
  />
)}
```

## Testing Checklist

- [ ] Image viewing (JPG, PNG, GIF)
- [ ] Image zoom and fullscreen
- [ ] Video playback
- [ ] Video controls (play, pause, seek, speed)
- [ ] Video fullscreen
- [ ] Audio playback
- [ ] Audio controls
- [ ] PDF viewing
- [ ] Code viewing with themes
- [ ] Document viewing (Word, Excel, PowerPoint)
- [ ] Unsupported file handling
- [ ] Offline indicators for all types
- [ ] Download functionality
- [ ] Share functionality

## Notes

- No additional dependencies needed (uses expo-av, react-native-webview already in project)
- Custom slider implementation (no @react-native-community/slider needed)
- All components handle loading/error states internally
- Consistent UI with OLIN app design (red accent color #ea4335)
