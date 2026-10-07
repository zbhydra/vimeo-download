# How to download subtitles from a Vimeo video as VTT

To save a Vimeo video's subtitles or captions, use the Vimeo Downloader browser extension. Open a public video that has subtitles, pick a language in the Subtitle row, and the extension saves it as a separate `.vtt` file. The [online tool](/) can't do this: it saves an MP4 video only. Vimeo's own transcript download covers only videos you or your team uploaded, and it needs a paid plan.

[EXTENSION_CTA]

*Last reviewed: October 6, 2026.*

## What you get

- **A separate `.vtt` file for the language you pick.** WebVTT is a W3C text format for captions and subtitles. A WebVTT file is encoded as UTF-8, and each caption is a time range, such as `00:00:00.000 --> 00:00:25.000`, followed by its text ([W3C WebVTT specification](https://www.w3.org/TR/webvtt1/)).
- **The subtitles the video already has.** The extension doesn't create, edit or translate subtitles.
- **Not a plain transcript.** The file contains timing lines as well as the text. The extension doesn't produce a clean text transcript.
- **Not merged into the video.** The subtitles stay in their own file. If you also want the video, see [How to download a Vimeo video](/guides/how-to-download-a-vimeo-video/).
- **The whole track.** Subtitles always download as a full file, and the extension's Trim controls don't cut them.

## What you need

- A Chrome or other Chromium-based browser with the extension installed.
- A public Vimeo video that has at least one subtitle or caption track, open on a vimeo.com or player.vimeo.com page.
- The right to keep the subtitles. They can be protected by copyright, like the video and its audio. [Is it legal to download Vimeo videos?](/guides/is-it-legal-to-download-vimeo-videos/) explains the rules.

## Save subtitles with the page panel

1. Open the video on vimeo.com and let the page finish loading.
2. Find the download panel near the video's title and look at the **Subtitle** row. It has one button for each subtitle or caption track, labeled with the name the player gives it, usually the language.
3. Select the language you want.
4. Your browser saves a `.vtt` file in your Downloads folder, in a subfolder called `vimeoMediaDownloader` unless you changed the location in the extension's settings.

<!-- MEDIA: extension-page-panel-subtitle-row.png | alt: The Vimeo Downloader panel on a Vimeo video page with the Subtitle row showing one button per language -->

## Save subtitles with the popup

1. Open the video page, then select the extension's icon in your browser toolbar to open the popup.
2. In the **Subtitle** row, choose a language from the menu.
3. Select the download arrow at the end of the row.

## When the Subtitle row is empty

The extension lists the subtitle and caption tracks that the Vimeo player offers for the video. When it finds none, the panel shows a disabled "-" button in the Subtitle row, and the popup shows "Unavailable". Typical reasons are that the owner hasn't added subtitles or captions, or that the text is part of the picture itself (burned in). Burned-in text is not a track, so there is nothing to save separately.

If the popup says "No downloadable video on this page" or is still scanning, wait for the page to finish loading and select **Rescan**.

## If the video is yours

Vimeo's own transcript download is the first thing to try. Vimeo says it needs a paid plan and edit access to the video, and that transcripts are available only for videos with captions or subtitles uploaded or auto-generated. Select the video, choose **Languages** in the left-hand navigation, open the three-dot menu next to the transcript, and select **Download**. Vimeo says the file downloads as `.srt`, `.vtt` or `.ttml` ([How to view or download my video's transcript](https://help.vimeo.com/hc/en-us/articles/12425955868817-How-to-view-or-download-my-video-s-transcript), updated August 31, 2026).

## Using the file

A `.vtt` file opens in any text editor. To watch the video with it, load the file in a player that supports external subtitle files.

## Limits

- **Public videos only.** Private, password-protected and paid videos are not guaranteed to work, and the extension doesn't remove DRM or bypass Vimeo's access controls.
- **Vimeo pages in a browser only.** The extension works on vimeo.com and player.vimeo.com pages. It doesn't work in the Vimeo desktop or mobile apps, or on other sites.
- **No format conversion.** The extension saves each track in the format Vimeo provides, which is normally WebVTT (`.vtt`). You can't choose SRT.
- **A daily allowance.** The free plan has a daily download allowance, and each file you save counts toward it. A paid Unlimited plan removes the daily limit. Signing in is optional. See [Pricing](/ext-pricing/).

## Frequently asked questions

**Can the online tool download Vimeo subtitles?**
No. The online tool saves one MP4 video per link and doesn't produce subtitle files. [How to download a Vimeo video](/guides/how-to-download-a-vimeo-video/) explains what it does.

**Can I get the subtitles as SRT?**
Not with the extension, because it doesn't convert formats. If the video is yours, Vimeo's transcript download offers `.srt`, `.vtt` and `.ttml`, as described above.

**Can I download a video with the subtitles included in the file?**
No. The extension saves subtitles as a separate file and doesn't merge them into the video.

**Does the extension translate subtitles?**
No. It saves only the tracks the video already has.

**Is saving a video's subtitles allowed?**
That depends on the owner's permission, Vimeo's Terms of Service and copyright law. Our [legal guide](/guides/is-it-legal-to-download-vimeo-videos/) covers each of them.

## Using the extension responsibly

Vimeo Downloader is an independent tool operated by Ginyo Technologies Limited. It is not affiliated with, endorsed by or connected to Vimeo, Inc. Vimeo is a trademark of Vimeo, Inc. The extension is meant for videos you already have legitimate access to and the right to save. You are responsible for copyright law and for the terms of Vimeo and of the video's owner.

[EXTENSION_CTA]
