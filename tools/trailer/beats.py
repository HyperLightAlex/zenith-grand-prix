# The song's beats, onsets and loudness (pip install librosa): the cuts and
# the graphics land on these. Prints a summary; writes beats.json.
#   python3 tools/trailer/beats.py <song.wav> [out=tools/trailer/beats.json]
import librosa, numpy as np, json, os, sys
song = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'beats.json')
y, sr = librosa.load(song, sr=22050, mono=True)
dur = len(y)/sr
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time', tightness=200)
oenv = librosa.onset.onset_strength(y=y, sr=sr)
times = librosa.times_like(oenv, sr=sr)
onsets = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, units='time', backtrack=False)
rms = librosa.feature.rms(y=y)[0]; rt = librosa.times_like(rms, sr=sr)
print('duration', round(dur,3), 'tempo', tempo)
b = np.array(beats); print('beats', len(b), 'first', b[:8].round(3), 'median ibi', np.median(np.diff(b)).round(4))
# strongest onsets
idx = np.argsort(oenv)[::-1]
strong=[]
for i in idx:
    t=times[i]
    if all(abs(t-s)>0.35 for s in strong): strong.append(t)
    if len(strong)>=40: break
print('strongest onsets', sorted(round(t,2) for t in strong))
# around 40-44
w=(times>39)&(times<45)
for t,v in zip(times[w],oenv[w]):
    if v>np.percentile(oenv,90): print('  onset %.3f %.2f'%(t,v))
# loudness per second
sec=[float(np.mean(rms[(rt>=k)&(rt<k+1)])) for k in range(int(dur)+1)]
print('rms/sec', ' '.join('%d:%.2f'%(k,v) for k,v in enumerate(sec)))
json.dump({'tempo':float(np.atleast_1d(tempo)[0]),'beats':[float(x) for x in b],'onsets':[float(x) for x in onsets],'dur':dur}, open(out,'w'))
