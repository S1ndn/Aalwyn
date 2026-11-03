"""Split the rendered tutorial reel at its blank-background pauses."""
import argparse, json, re, shutil, subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, default=Path('video/output/tutorial-clips'))
args = parser.parse_args()
ffmpeg = Path('video/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe')
ffprobe = Path('video/node_modules/@ffprobe-installer/win32-x64/ffprobe.exe')
source = Path('video/output/tutorial-series.mp4')
manifest = json.loads(Path('video/examples/series/manifest.json').read_text())
levels = Path('video/output/tutorial-levels.txt')
subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-i', str(source), '-vf',
    'scale=160:90,signalstats,metadata=print:file=' + levels.as_posix(), '-an', '-f', 'null', 'NUL'], check=True)
records = []
for block in re.split(r'(?=frame:)', levels.read_text()):
    time = re.search(r'pts_time:([0-9.]+)', block)
    low = re.search(r'lavfi.signalstats.YMIN=([0-9.]+)', block)
    high = re.search(r'lavfi.signalstats.YMAX=([0-9.]+)', block)
    if time and low and high:
        records.append((float(time[1]), float(high[1]) - float(low[1]) <= 1))
pauses = []
start = None
for time, blank in records:
    if blank and start is None: start = time
    if not blank and start is not None:
        if time-start >= 0.25: pauses.append((start, time))
        start = None
if start is not None: pauses.append((start, records[-1][0] + 1/60))
if len(pauses) != len(manifest) + 1:
    raise RuntimeError(f'Expected nine background pauses, got {pauses}')
cuts = [round((a+b)/2*60)/60 for a,b in pauses[1:-1]]
args.out.mkdir(parents=True, exist_ok=True)
subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-i', str(source),
    '-force_key_frames', ','.join(map(str, cuts)), '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-f', 'segment', '-segment_times',
    ','.join(map(str,cuts)), '-segment_start_number', '1', '-reset_timestamps', '1',
    '-segment_format_options', 'movflags=+faststart', str(args.out/'clip-%02d.mp4')], check=True)
report = []
for i,item in enumerate(manifest, 1):
    clip = args.out/(item['slug']+'.mp4')
    (args.out/f'clip-{i:02}.mp4').replace(clip)
    shutil.copyfile(Path('video/examples/series')/(item['slug']+'.aal'), args.out/(item['slug']+'.aal'))
    info = json.loads(subprocess.check_output([str(ffprobe), '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(clip)]))
    duration = float(info['format']['duration'])
    for offset in [0, max(0, duration-0.05)]:
        pixels = subprocess.check_output([str(ffmpeg), '-v', 'error', '-ss', str(offset), '-i', str(clip),
            '-frames:v', '1', '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
        if not pixels or max(max(pixels[c::3])-min(pixels[c::3]) for c in range(3)) > 3:
            raise RuntimeError(f'{clip.name} does not start/end with a flat background at {offset}')
    report.append({'file':clip.name, 'title':item['title'], 'seconds':duration})
(args.out/'index.json').write_text(json.dumps(report,indent=2)+'\n')
(args.out/'README.md').write_text('# Aalwyn tutorial clips\n\nEight 1080p/60 fps clips, ordered from arithmetic to conditionals. One instruction per second; conditional goals are introduced with two readable rule rows.\nEach starts and ends on the same background color. Expressions preserve raw instruction-order LaTeX without a final simplification or factorization. Matching .aal source files are included.\n\n'+
    '\n'.join(f"{i}. {r['title']} — {r['file']} ({r['seconds']:.1f}s)" for i,r in enumerate(report,1))+'\n')
print(json.dumps(report, indent=2))
