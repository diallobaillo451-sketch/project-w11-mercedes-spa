# Suivi du fondamental (somme sous-harmonique + Viterbi), méthode reprise de f1sg/tools/audio/track.py
import librosa,numpy as np,sys
name=sys.argv[1];W='/workspace/w11/assets-work/audio/'
y,sr=librosa.load(W+name+'_mono.wav',sr=22050)
hop=256;nfft=4096
S=np.abs(librosa.stft(y,n_fft=nfft,hop_length=hop))
L=np.log1p(S/(S.max()*1e-4))
cands=np.arange(30,140,0.25);K=np.arange(1,25)
score=np.zeros((len(cands),S.shape[1]))
for i,c in enumerate(cands):
    fk=c*K;fk=fk[fk<3000];idx=fk/(sr/nfft);lo=np.floor(idx).astype(int);w=idx-lo
    v=(L[lo]*(1-w)[:,None]+L[lo+1]*w[:,None])
    mid=(c*(K[:len(fk)]-0.5))/(sr/nfft);lo2=np.floor(mid).astype(int);w2=mid-lo2
    v2=(L[lo2]*(1-w2)[:,None]+L[lo2+1]*w2[:,None]);score[i]=(v-0.5*v2).mean(0)
n,T=score.shape;trans=-0.005*np.abs(np.arange(n)[:,None]-np.arange(n)[None,:])
D=score[:,0].copy();bp=np.zeros((n,T),int)
for t in range(1,T):
    M=D[:,None]+trans;bp[:,t]=M.argmax(0);D=M.max(0)+score[:,t]*3
path=np.zeros(T,int);path[-1]=D.argmax()
for t in range(T-1,0,-1):path[t-1]=bp[path[t],t]
f0=cands[path];conf=score[path,np.arange(T)]
tt=librosa.frames_to_time(np.arange(T),sr=sr,hop_length=hop)
rms=librosa.feature.rms(y=y,frame_length=nfft,hop_length=hop)[0][:T]
# centroïde spectral (indicateur charge : gaz ouvert = plus brillant)
cen=librosa.feature.spectral_centroid(S=S,sr=sr)[0][:T]
np.savez(W+name+'_track.npz',t=tt,f0=f0,conf=conf,rms=rms,cen=cen)
for s in range(0,int(tt[-1]),2):
    i=np.searchsorted(tt,s);print(s,f0[i],round(float(conf[i]),2),int(f0[i]*120),round(float(20*np.log10(rms[i]+1e-9)),1),int(cen[i]))
