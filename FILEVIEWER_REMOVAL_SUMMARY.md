# OLIN LMS - FileViewer Removal Summary

## Overview

This document summarizes the changes made to remove all in-app file viewer components from OLIN LMS mobile app. The app now delegates all file viewing to Android OS and third-party apps (Google Files, PDF viewers, Word, etc.).

## Why This Change?

1. **Lightweight App**: LMS apps should focus on content management, not file rendering
2. **Better Compatibility**: Android's built-in file handling works with all file types
3. **Fewer Failures**: Third-party viewers handle edge cases better
4. **User Experience**: Users can choose their preferred app for viewing files
5. **Reduced Maintenance**: Less code to maintain and debug

## Files Deleted

The following FileViewer components were removed from `components/FileViewer/`:

- `AudioPlayer.tsx` - In-app audio player
- `VideoPlayer.tsx` - In-app video player  
- `PDFViewer.tsx` - In-app PDF viewer
- `PDFViewer.android.tsx` - Android-specific PDF viewer
- `ImageViewer.tsx` - In-app image viewer
- `DocumentViewer.tsx` - General document viewer
- `CodeViewer.tsx` - Source code syntax highlighter
- `UnsupportedViewer.tsx` - Fallback for unknown types
- `index.tsx` - Main FileViewer component export

## Files Kept

- `components/FileViewer/utils.ts` - Utility functions (detectFileType, getMimeType, formatFileSize)
- `components/FileViewer/index.ts` - New minimal export file for utilities only

## Files Created

- `lib/downloadUtils.ts` - New centralized download utilities
  - `downloadToDevice()` - Downloads to Downloads/OLIN/{CourseName}/
  - `openFileExternal()` - Opens via Android intents
  - `shareFile()` - iOS/Android file sharing
  - `deleteDownloadedFile()` - Removes downloaded files
  - `isFileDownloaded()` - Checks download status
  - `formatBytes()` - Size formatting utility

## Files Modified

### app/(app)/courses/materials/[materialId].tsx

- Removed FileViewer import, kept detectFileType utility
- Removed fileOpenPolicy import (no longer needed)
- Removed FileViewer Modal component
- Removed state variables: `activeFileViewerUri`, `activeFileViewerName`, `showFileViewer`
- Updated `handleFileCardPress()` to open files externally
- Updated `downloadFileToApp()` to show "Open File" option after download
- Updated `tempDownloadAndOpenInViewer()` to use external apps
- Simplified FileActionSheet actions:
  - **Not Downloaded**: "Download for Offline", "Save to Device"
  - **Downloaded**: "Open File", "Save to Device", "Share File", "Remove Download"
- Updated inline viewer content to open files externally on tap

### app/(app)/courses/assessments/[assessmentId].tsx

- Same changes as materials page
- Removed FileViewer Modal
- Removed fileOpenPolicy import
- Removed in-app viewer state variables
- Simplified FileActionSheet actions
- All file viewing now delegates to external apps

## New User Experience

### Before (Old)
1. User taps file → App decides between in-app viewer vs external app
2. PDFs, images, videos opened in custom viewers
3. Office files opened externally (Word, Excel, etc.)
4. Complex logic to determine best viewer

### After (New)
1. User taps file → **Always opens with external app**
2. Android shows app chooser (PDF viewer, Gallery, etc.)
3. User can set default apps for file types
4. Consistent, predictable behavior

## Action Sheet Options

### For Files NOT Downloaded
| Option | Description |
|--------|-------------|
| Download for Offline | Save to app storage for offline access |
| Save to Device | Save to Downloads/Documents folder |

### For Downloaded Files
| Option | Description |
|--------|-------------|
| Open File | Open with another app (via Android Intent) |
| Save to Device | Export to Downloads/Documents folder |
| Share File | Share via Android share sheet |
| Remove Download | Delete from app storage |

## Download Location

Files are saved to: `Downloads/OLIN/{CourseName}/{filename}`

Example: `Downloads/OLIN/Introduction to Programming/lecture_notes.pdf`

## Technical Notes

- Uses `expo-intent-launcher` for Android ACTION_VIEW intents
- Uses `expo-sharing` for iOS file sharing
- Uses `expo-file-system/legacy` for file operations
- MIME types determined from file extension
- Content URIs used for Android (via `getContentUriAsync`)

## Testing Checklist

- [ ] Materials page - Download file → Alert shows "Open File" option
- [ ] Materials page - Tap downloaded file → Opens in external app
- [ ] Materials page - FileActionSheet shows correct options
- [ ] Assessments page - Same functionality as materials
- [ ] Files open in correct app (PDF in PDF viewer, images in Gallery, etc.)
- [ ] "Save to Device" works for both downloaded and new files
- [ ] "Share File" opens Android share sheet
- [ ] "Remove Download" deletes file from app storage

## Rollback

If needed, the FileViewer components can be restored from git history:
```bash
git checkout HEAD~1 -- components/FileViewer/
```

---

**Date**: 2025
**Author**: OLIN Development Team
