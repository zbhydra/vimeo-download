---
title: How to get the transcript of a Vimeo video
seoTitle: 'How to Get a Vimeo Transcript: View It or Download It'
description: "See a Vimeo video's transcript on its page, download it if the video is yours, or save a public video's captions as a VTT file and turn them into plain text."
publishedAt: 2026-11-02
updatedAt: 2026-11-02
---

To read a Vimeo video's transcript, select the **Transcript** button below the player on vimeo.com. The button appears when the owner has enabled a transcript. If the video is yours, you can download the transcript from its settings as `.srt`, `.vtt` or `.ttml`. Vimeo's transcript download needs edit access, so for someone else's public video, the Vimeo Downloader browser extension can save the captions the player offers as a `.vtt` file, and you can turn that into plain text.

*Last reviewed: November 2, 2026.*

## Which method fits your situation

- **You only need to read or search it:** use [the Transcript button](#read-the-transcript-on-the-video-page).
- **The video is yours or your team's:** [download it from Vimeo](#download-the-transcript-of-your-own-video).
- **It's someone else's public video and you need a file:** [save its captions with the extension](#save-the-captions-of-a-public-video), then [turn the file into plain text](#turn-a-vtt-file-into-plain-text).
- **The video has no captions:** there is no transcript to get. See [what you can do instead](#if-the-video-has-no-captions).

## Read the transcript on the video page

Vimeo says the **Transcript** button appears below the player as long as the owner has enabled a transcript, and that a video without the button doesn't contain one ([How to access transcripts on the video page](https://help.vimeo.com/hc/en-us/articles/34067260063505-How-to-access-transcripts-on-the-video-page), updated January 13, 2026).

1. Open the video on vimeo.com and select **Transcript**. The whole transcript opens in a panel to the right of the player.
2. Read along as the video plays. The panel highlights the words being spoken, and you can click a line to jump to that moment.
3. To find a word, select the magnifying glass.
4. To change the language or hide the timestamps, open the settings menu at the top right of the panel.

The panel is made for reading. Vimeo's article for viewers doesn't describe a way to download the text.

## Download the transcript of your own video

Vimeo says this works on the Free plan and all paid plans. You need edit access to the video, and the video needs captions or subtitles, uploaded or auto-generated ([How to view or download my video's transcript](https://help.vimeo.com/hc/en-us/articles/12425955868817-How-to-view-or-download-my-video-s-transcript), updated October 8, 2026).

1. Select the video in your Library.
2. In the left-hand navigation, select **Languages**.
3. Select the three vertical dots next to the transcript.
4. Select **Download**. Vimeo says the file downloads as `.srt`, `.vtt` or `.ttml`.

Auto-generated captions can contain errors, and Vimeo suggests correcting them before you publish. The pencil icon in the same menu opens the transcript for editing.

## Save the captions of a public video

For a video you don't own, Vimeo's download above isn't available. The exception is some On Demand titles you bought: their Download window can include caption files, though Vimeo notes that not all titles offer them ([Download captions or subtitles for On Demand titles](https://help.vimeo.com/hc/en-us/articles/12426105647249-Download-captions-or-subtitles-for-On-Demand-titles), updated January 13, 2026).

The Vimeo Downloader browser extension saves the caption tracks the Vimeo player already offers. It doesn't create or translate captions. It runs in Chrome and other Chromium-based browsers on a computer. It's free to start, with a daily allowance, and each file you save counts toward it. [Install it from the Chrome Web Store](https://chromewebstore.google.com/detail/vimeo-downloader-download/joalfalamongfmejacciadcpdeahblai?utm_source=vimeodownloader.app&utm_medium=guide&utm_campaign=how-to-get-a-vimeo-transcript).

1. Open the video on vimeo.com or player.vimeo.com and let the page finish loading.
2. Select the extension's icon in your browser toolbar to open the popup.
3. In the **Subtitle** row, choose a track. The names come from the player, for example `English (auto-generated)`.
4. Select the download arrow at the end of the row. Your browser saves a `.vtt` file in your Downloads folder, in a subfolder called `vimeoMediaDownloader` unless you changed the location in the extension's settings.

On vimeo.com you can also use the download panel near the video's title. [How to download subtitles from a Vimeo video as VTT](/guides/download-vimeo-subtitles-as-vtt/) covers both in detail.

### What we found on real videos

On November 2, 2026 we checked 13 public videos from Vimeo's Staff Picks and Watch pages. That is a small, hand-picked sample, so treat these as examples and not as rates:

- **10 of the 13 had at least one caption track.** On 7 of those 10 the only track was auto-generated.
- **The Transcript button was common.** We opened 7 of those 10 video pages on vimeo.com, and 6 showed the button, including videos with only auto-generated captions.
- **Auto-generated tracks can be wrong or nearly empty.** One track labeled `English (auto-generated)` contained text in another language, and another had a single caption for the whole video.

Read the text before you rely on it, especially if the video has little speech or more than one language.

## Turn a VTT file into plain text

A `.vtt` file is already a text file, and it opens in any text editor. If you want the timestamps, you already have a timed transcript. It looks like this:

```text
WEBVTT

1
00:00:00.320 --> 00:00:02.080
Welcome back to the course.

2
00:00:05.320 --> 00:00:07.900
Today we start with lighting.
```

To keep only the words, use either of these.

**In a text editor with regular expressions, such as VS Code:**

1. Open the file, open Find and Replace, and turn on regular expressions.
2. Find `^(WEBVTT.*|\d+|.*-->.*)?\n` and replace all matches with nothing. This removes the header, the numbers, the timing lines and the blank lines.
3. Find `<[^>]+>` and replace all matches with nothing. This removes formatting tags such as `<i>`, which uploaded captions sometimes use.
4. Save the result as a `.txt` file.

**In a terminal on a Mac or Linux:**

```bash
tr -d '\r' < captions.vtt | grep -vE '^(WEBVTT|[0-9]+$|.*-->|$)' | sed -E 's/<[^>]+>//g' > transcript.txt
```

We ran both on the 11 caption files from the check above, and each one came out with only the caption text. Three things to expect in the result:

- Each caption stays on its own line, so sentences are broken across lines.
- Descriptions of sounds, such as `(door closes)`, stay in the text.
- A caption line that contains only a number is removed along with the numbering, and `NOTE` or `STYLE` blocks stay in the text. None of our files had either, but other files could.

## If the video has no captions

Vimeo builds transcripts from captions or subtitles, so without them there's nothing to view or save. Text burned into the picture isn't a track either.

- **If the video is yours,** add captions or subtitles first ([How to add captions or subtitles to my video](https://help.vimeo.com/hc/en-us/articles/21956884955537-How-to-add-captions-or-subtitles-to-my-video)).
- **If it's someone else's,** ask the owner for a transcript, or to turn captions on.
- **If you have the right to use the video,** you can [save its audio as M4A or MP3](/guides/save-vimeo-audio-as-mp3-or-m4a/) with the extension and run the file through a transcription service.

## Frequently asked questions

### Can I download the transcript of someone else's Vimeo video from Vimeo?

Generally no. Vimeo says you need edit access to the video to download its transcript. You can read the transcript on the video page if the owner enabled one, and some purchased On Demand titles include caption files.

### Is a Vimeo transcript the same as a caption file?

They hold the same words. Vimeo says transcripts are available only for videos with captions or subtitles, and a caption file adds the timing for each line.

### Can I get the transcript as SRT?

If the video is yours, yes: Vimeo's download offers `.srt`, `.vtt` and `.ttml`. The extension saves each track in the format Vimeo provides, normally `.vtt`, and doesn't convert it.

### Can the online tool get a transcript?

No. The [online tool](/) saves one MP4 per link and doesn't produce text or caption files.

### Does this work for private or password-protected videos?

Private, password-protected and paid videos are not guaranteed to work with the extension, and it doesn't bypass Vimeo's access controls.

### Is saving a transcript allowed?

That depends on the owner's permission, Vimeo's Terms of Service and copyright law. Captions can be protected by copyright, like the video itself. Our [legal guide](/guides/is-it-legal-to-download-vimeo-videos/) covers each of them.

## Using the extension responsibly

Vimeo Downloader is an independent tool operated by Ginyo Technologies Limited. It is not affiliated with, endorsed by or connected to Vimeo, Inc. Vimeo is a trademark of Vimeo, Inc. The extension is meant for videos you already have legitimate access to and the right to save. You are responsible for copyright law and for the terms of Vimeo and of the video's owner.
