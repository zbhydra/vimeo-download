# Chrome Web Store Listing

## Basic information

- Name: Vimeo Downloader - Download HD Video & Audio
- Short description: Download Vimeo videos, audio and cover images from vimeo.com and player.vimeo.com in any available quality.
- Category: Productivity
- Language: English

## Detailed description

Download videos, audio tracks, and cover images from Vimeo pages you are authorized to save.

Vimeo Downloader adds a focused download control directly to supported Vimeo pages. Choose the available video quality, save audio when an audio stream is available, or download the cover image separately.

Features:

- Download video in any quality offered by the source
- Save available audio streams separately
- Download the video cover image
- Select a clip range when the source supports it
- Queue downloads while continuing to browse
- Handle large files through the browser download flow
- View download status and history in the extension popup

The extension only works with supported Vimeo pages and does not bypass access controls. Download content only when you have the right to save it.

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

- 01-video-audio-thumbnail-1280x800.png: video, audio, and thumbnail output.
- 02-available-quality-1280x800.png: source-provided quality selection.
- 03-output-types-1280x800.png: choose exactly the output type needed.
- 04-trim-before-download-1280x800.png: Premium DASH/HLS clip trimming.
- 05-queue-large-files-1280x800.png: queued downloads and large-file modes.

Additional store assets:

- 06-promo-tile-440x280.png: small promotional tile.
- 07-marquee-1400x560.png: marquee promotional tile.
- icon-128.png: store icon.

The only extension package to upload is extension/dist.zip; it is intentionally not duplicated in this directory.
