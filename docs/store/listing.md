# Chrome Web Store Listing

## Basic information

- Name: Vimeo Downloader - Download HD Video & Audio
- Short description: Download Vimeo videos as MP4 in any available quality, up to 4K. Save audio as MP3 or M4A and subtitles as VTT. Free to start.
- Category: Productivity
- Language: English

The name and short description come from the extension package (`extension/public/_locales/*/messages.json`), so they change only when a new package is uploaded.

## Detailed description

The complete English store copy is maintained in [locales/en.md](locales/en.md). Copy its **Detailed description** section into the Chrome Web Store listing.

## Permission justifications

- storage: save extension settings, download history, and local device state.
- identity: support the extension's optional account sign-in flow.
- downloads: create and track browser downloads requested by the user.
- offscreen: process media work that cannot run in the popup document.
- notifications: report download completion and actionable failures.
- Vimeo host permissions: read media metadata and add download controls on supported Vimeo pages.

## Privacy statement

The extension does not sell personal information. It uses the minimum browser permissions required for downloads and optional account features. Media downloads are initiated by the user and use the browser's download mechanism. Account and service requests go only to the configured Vimeo Downloader service endpoints.

## Screenshot assets

Upload these five general promotional screenshots:

- 01-from-the-page-1280x800.png: download from the current page.
- 02-quality-up-to-4k-1280x800.png: source-provided quality selection, up to 4K.
- 03-video-audio-cover-1280x800.png: video, audio, or cover image output.
- 04-trim-before-download-1280x800.png: DASH/HLS clip trimming.
- 05-queue-1280x800.png: queued downloads and large files.

Additional store assets:

- 06-promo-tile-440x280.png: small promotional tile.
- 07-marquee-1400x560.png: marquee promotional tile.
- icon-128.png: store icon.

The only extension package to upload is extension/dist.zip; it is intentionally not duplicated in this directory.
