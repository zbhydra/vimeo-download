from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
FONT = Path('/System/Library/Fonts/Supplemental')
WHITE = '#f5f8ff'
MUTED = '#c2ccdb'
BLUE = '#006efe'
CARD = '#111d2d'


def font(name, size):
    return ImageFont.truetype(str(FONT / name), size)


def base(name):
    return Image.open(ROOT / name).convert('RGB').resize((1280, 800))


def text_block(draw, title, subtitle, label='VIDEO DOWNLOADER FOR VIMEO'):
    draw.text((68, 92), label, font=font('Arial Bold.ttf', 19), fill='#91bcff')
    draw.rectangle((68, 139, 114, 143), fill=BLUE)
    y = 181
    for line in title:
        draw.text((68, y), line, font=font('Arial Bold.ttf', 54), fill=WHITE)
        y += 64
    y += 18
    for line in subtitle:
        draw.text((68, y), line, font=font('Arial.ttf', 23), fill=MUTED)
        y += 34


def panel(draw, box, title, rows):
    draw.rounded_rectangle(box, 18, fill=CARD, outline='#3d6ea7', width=2)
    x, y, right, bottom = box
    draw.text((x + 25, y + 22), title, font=font('Arial Bold.ttf', 21), fill=WHITE)
    y += 72
    for index, row in enumerate(rows):
        draw.rounded_rectangle((x + 20, y, right - 20, y + 54), 10,
                               fill=BLUE if index == 0 else '#1b2b40')
        draw.text((x + 38, y + 14), row, font=font('Arial Bold.ttf', 19), fill=WHITE)
        y += 68


def footer(draw):
    draw.text((68, 751), 'Feature illustration • Use content you have the right to save',
              font=font('Arial.ttf', 16), fill='#94a8c1')


def save(image, name):
    image.save(ROOT / name, format='PNG')


def main():
    image = base('sources/one-click-download.png')
    draw = ImageDraw.Draw(image)
    text_block(draw, ['Save Vimeo', 'video & audio'],
               ['Download video, audio, and thumbnail', 'from supported pages.'])
    panel(draw, (795, 168, 1190, 613), 'Download', ['Video  1080p', 'Best Audio', 'Thumbnail'])
    footer(draw)
    save(image, '01-video-audio-thumbnail-1280x800.png')

    image = base('quality-selection-640x400.png')
    draw = ImageDraw.Draw(image)
    text_block(draw, ['Choose your', 'video quality'],
               ['Pick any quality offered by the source.', 'The available list depends on the video.'])
    panel(draw, (800, 162, 1195, 622), 'Available quality', ['1080p', '720p', '540p', '360p'])
    footer(draw)
    save(image, '02-available-quality-1280x800.png')

    image = base('sources/one-click-download.png')
    draw = ImageDraw.Draw(image)
    text_block(draw, ['Video, audio,', 'or thumbnail'],
               ['Save exactly what you need', 'from a supported Vimeo page.'])
    panel(draw, (760, 165, 915, 595), 'VIDEO', ['Quality', 'Download'])
    panel(draw, (935, 215, 1090, 645), 'AUDIO', ['Best Audio', 'M4A'])
    panel(draw, (1110, 265, 1265, 695), 'IMAGE', ['Thumbnail', 'Save'])
    footer(draw)
    save(image, '03-output-types-1280x800.png')

    image = base('sources/one-click-download.png')
    draw = ImageDraw.Draw(image)
    text_block(draw, ['Trim before', 'you download'],
               ['Set start and end for DASH/HLS qualities.', 'Save only the segment you need.'])
    draw.rounded_rectangle((745, 178, 1198, 430), 16, fill='#263a52', outline='#6994c9', width=2)
    draw.rectangle((775, 315, 1168, 319), fill='#526e8d')
    draw.rectangle((852, 306, 1075, 328), fill=BLUE)
    draw.ellipse((844, 298, 866, 320), fill=WHITE)
    draw.ellipse((1064, 298, 1086, 320), fill=WHITE)
    draw.rounded_rectangle((745, 462, 1198, 620), 16, fill=CARD, outline='#3d6ea7', width=2)
    draw.text((777, 493), 'Premium', font=font('Arial Bold.ttf', 20), fill='#8fbcff')
    draw.text((777, 535), 'Start  00:30     End  01:45', font=font('Arial Bold.ttf', 21), fill=WHITE)
    footer(draw)
    save(image, '04-trim-before-download-1280x800.png')

    image = base('sources/one-click-download.png')
    draw = ImageDraw.Draw(image)
    text_block(draw, ['Queue large', 'downloads'],
               ['Auto split big files or stream', 'them into one file.'])
    panel(draw, (755, 155, 1165, 605), 'Queue (3)', ['Downloading  42%', 'Waiting...', 'Ready'])
    draw.rounded_rectangle((835, 570, 1195, 690), 14, fill='#1d3047', outline='#4b79ae', width=2)
    draw.text((860, 596), 'Large file mode', font=font('Arial Bold.ttf', 19), fill=WHITE)
    draw.text((860, 633), 'Auto split  •  Never split', font=font('Arial.ttf', 18), fill=MUTED)
    footer(draw)
    save(image, '05-queue-large-files-1280x800.png')

    image = Image.open(ROOT / '01-video-audio-thumbnail-1280x800.png').resize((440, 280))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((18, 18, 422, 262), 14, fill='#0c1522', outline='#3d6ea7', width=2)
    draw.text((38, 42), 'Video Downloader', font=font('Arial Bold.ttf', 27), fill=WHITE)
    draw.text((38, 84), 'Video • Audio • Thumbnail', font=font('Arial Bold.ttf', 19), fill='#8fbcff')
    draw.text((38, 126), 'Save what you need', font=font('Arial.ttf', 19), fill=MUTED)
    draw.text((38, 157), 'from supported pages.', font=font('Arial.ttf', 19), fill=MUTED)
    save(image, '06-promo-tile-440x280.png')

    image = Image.open(ROOT / '01-video-audio-thumbnail-1280x800.png').resize((1400, 560))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1400, 560), fill='#07101d')
    draw.text((74, 112), 'Video Downloader for Vimeo', font=font('Arial Bold.ttf', 50), fill=WHITE)
    draw.text((74, 188), 'Video, audio, thumbnail and quality control in one focused tool.',
              font=font('Arial.ttf', 27), fill=MUTED)
    draw.rounded_rectangle((74, 285, 595, 361), 12, fill=BLUE)
    draw.text((103, 307), 'Save exactly what you need', font=font('Arial Bold.ttf', 24), fill=WHITE)
    draw.text((74, 457), 'Use content you have the right to save.', font=font('Arial.ttf', 18), fill='#94a8c1')
    save(image, '07-marquee-1400x560.png')


if __name__ == '__main__':
    main()
