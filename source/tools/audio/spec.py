import numpy as np,librosa,matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt,sys
W='/workspace/w11/assets-work/audio/';name=sys.argv[1]
y,sr=librosa.load(W+name+'_mono.wav',sr=22050);d=np.load(W+name+'_track.npz')
fig,ax=plt.subplots(3,1,figsize=(22,10),sharex=True)
S=librosa.amplitude_to_db(np.abs(librosa.stft(y,n_fft=4096,hop_length=512)),ref=np.max)
ax[0].imshow(S[:560],origin='lower',aspect='auto',extent=[0,len(y)/sr,0,560*sr/4096],vmin=-70,cmap='magma')
ax[0].plot(d['t'],d['f0']*6,'c',lw=.6)
ax[1].plot(d['t'],d['f0']*120,lw=.6);ax[1].set_ylabel('rpm (120·f0)');ax[1].grid()
ax[2].plot(d['t'],20*np.log10(d['rms']+1e-9),lw=.6);ax[2].set_ylim(-45,-10);ax[2].grid()
ax[2].set_xticks(np.arange(0,len(y)/sr,5))
plt.tight_layout();plt.savefig(W+name+'_spec.png',dpi=60)
