# How to save the audio from a Vimeo video as M4A or MP3

To save only the audio of a public Vimeo video, use the Vimeo Downloader browser extension. Open the video on vimeo.com, then choose **Best Audio** in the Audio row of the page panel to get an M4A file, or open the extension's popup, set the Audio row's format to MP3 and select its download arrow. The [online tool](/) can't do this: it saves an MP4 video only.

[EXTENSION_CTA]

*Last reviewed: October 6, 2026.*

## What you need

- A Chrome or other Chromium-based browser with the extension installed.
- A public Vimeo video, open on a vimeo.com or player.vimeo.com page.
- A video that offers a separate audio stream. If it doesn't, the Audio row stays empty. See [When the Audio row is empty](#when-the-audio-row-is-empty).
- The right to keep the audio. The audio in a video, including any music in it, can be protected by copyright. [Is it legal to download Vimeo videos?](/guides/is-it-legal-to-download-vimeo-videos/) explains the rules.

## Save the audio as M4A with the page panel

1. Open the video on vimeo.com and let the page finish loading.
2. Find the download panel near the video's title. It has four rows: Video, Audio, Subtitle and Image.
3. In the **Audio** row, select **Best Audio** for the highest-bitrate audio track, or pick another button. The other buttons are usually labeled with their bitrate in kbps.
4. Wait while the button shows its progress. The panel's buttons are locked until the download is finished.
5. Your browser saves an `.m4a` file in your Downloads folder, in a subfolder called `vimeoMediaDownloader` unless you changed the location in the extension's settings.

<!-- MEDIA: extension-page-panel-audio-row.png | alt: The Vimeo Downloader panel on a Vimeo video page with the Audio row showing Best Audio -->

The page panel saves M4A only. To get an MP3, use the popup.

## Save the audio as MP3 with the popup

1. Open the video page, then select the extension's icon in your browser toolbar to open the popup.
2. In the **Audio** row, pick a bitrate in the first menu. Next to it, set the format menu to **MP3**.
3. Select the download arrow at the end of the row.
4. The extension downloads the audio track, converts it to MP3 in the background, and your browser saves the `.mp3` file. For long audio, the progress can sit near the end while the conversion finishes.

The format menu always starts at M4A when you open the popup. Your MP3 choice is not remembered, so set it each time.

<!-- MEDIA: extension-popup-audio-mp3.png | alt: The Vimeo Downloader popup with the Audio row's format menu set to MP3 -->

## M4A or MP3?

- **M4A** is the video's own AAC audio track, saved without conversion.
- **MP3** is converted from that track in the background. Choose it if the player or device you use needs MP3 files.

## When the Audio row is empty

The extension builds its Audio options from the audio streams Vimeo offers for the video. If the video doesn't expose a separate audio stream, the page panel shows a disabled "-" button in the Audio row, and the popup shows "Unavailable". In that case this extension can't save the audio on its own.

If the popup says "No downloadable video on this page" or is still scanning, wait for the page to finish loading and select **Rescan**. If it says the page isn't a Vimeo page, open the video on vimeo.com first.

## Limits

- **Public videos only.** Private, password-protected and paid videos are not guaranteed to work, and the extension doesn't remove DRM or bypass Vimeo's access controls.
- **Vimeo pages in a browser only.** The extension works on vimeo.com and player.vimeo.com pages. It doesn't work in the Vimeo desktop or mobile apps, or on other sites.
- **A daily allowance.** The free plan has a daily download allowance, and each file you save counts toward it. A paid Unlimited plan removes the daily limit. Signing in is optional. See [Pricing](/ext-pricing/).

## Frequently asked questions

**Can the online tool save a Vimeo video as MP3?**
No. The online tool saves one MP4 video per link and doesn't produce separate audio files. [How to download a Vimeo video](/guides/how-to-download-a-vimeo-video/) explains what it does.

**Does the extension convert the whole video to audio?**
No. It saves the video's audio stream. For MP3, it converts that stream to MP3.

**Why is the Audio row disabled?**
The video doesn't expose a separate audio stream that the extension can save. See [When the Audio row is empty](#when-the-audio-row-is-empty).

**Is saving a video's audio allowed?**
That depends on the owner's permission, Vimeo's Terms of Service and copyright law. Our [legal guide](/guides/is-it-legal-to-download-vimeo-videos/) covers each of them.

## Using the extension responsibly

Vimeo Downloader is an independent tool operated by Ginyo Technologies Limited. It is not affiliated with, endorsed by or connected to Vimeo, Inc. Vimeo is a trademark of Vimeo, Inc. The extension is meant for videos you already have legitimate access to and the right to save. You are responsible for copyright law and for the terms of Vimeo and of the video's owner.

[EXTENSION_CTA]
