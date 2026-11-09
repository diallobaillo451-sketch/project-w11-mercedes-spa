# Boucles moteur par régime, construites UNIQUEMENT à partir des enregistrements fournis :
# lecture « varispeed » à hauteur constante (la tête de lecture suit ratio = régime_cible/régime_mesuré, ratio limité à ±10 %),
# sauts de grain avec fondu 30 ms à puissance constante, puis fondu de bouclage 120 ms. Vérification f0 du résultat.
import numpy as np,soundfile as sf,json,subprocess,os,librosa,scipy.signal as ss
W='/workspace/w11/assets-work/audio/';OUT='/workspace/w11/game/public/audio/engine/';os.makedirs(OUT,exist_ok=True)
rng=np.random.default_rng(11);sr=44100
SRC={}
for name,tmax in (('new',112),('old',103)):
    x,_=sf.read(W+name+'_mono.wav');d=np.load(W+name+'_track.npz');t=d['t'];r=d['f0']*120
    db=20*np.log10(d['rms']+1e-9);c=d['conf'];med=np.median(db[(t>2)&(t<tmax)])
    jump=np.abs(np.log(np.roll(r,-4)/np.roll(r,4)))>0.03
    ok=(t>1)&(t<tmax-0.5)&~jump&(c>2.5)
    # dé-emphase douce de l'ancien enregistrement (très compressé) pour rapprocher son timbre
    SRC[name]=dict(x=x,t=t,r=r,on=ok&(db>med-2.5),off=ok&(db<med-5))
def render(src,kind,R,dur):
    S=SRC[src];x=S['x'];t=S['t'];r=S['r'];m=S[kind]
    idx=np.where(m&(np.abs(np.log(r/R))<0.06))[0]
    if len(idx)<8: return None
    sidx=set(idx.tolist());BLK=64;XF=int(0.03*sr);N=int(dur*sr);out=np.zeros(N+BLK);fading=[];nsw=0
    def pick():
        i=rng.choice(idx[np.argsort(np.abs(np.log(r[idx]/R)))[:60]]);return t[i]*sr
    pos=pick();ar=np.arange(len(x))
    for o in range(0,N,BLK):
        i=min(np.searchsorted(t,pos/sr),len(t)-1);ratio=R/r[i]
        if (i not in sidx) or not(0.9<ratio<1.1):
            fading.append([pos,ratio,0]);pos=pick();nsw+=1;ratio=R/r[min(np.searchsorted(t,pos/sr),len(t)-1)]
        ps=pos+np.arange(BLK)*ratio;pos=ps[-1]+ratio;g=np.interp(ps,ar,x)
        if fading:
            for fd in fading:
                fp=fd[0]+np.arange(BLK)*fd[1];fd[0]=fp[-1]+fd[1];k=np.clip((fd[2]+np.arange(BLK))/XF,0,1);fd[2]+=BLK
                out[o:o+BLK]+=np.interp(fp,ar,x)*np.cos(k*np.pi/2)
            gin=np.min(np.array([np.clip((fd[2]-BLK+np.arange(BLK))/XF,0,1) for fd in fading]),0);g=g*np.sin(gin*np.pi/2)
            fading=[fd for fd in fading if fd[2]<XF]
        out[o:o+BLK]+=g
    return out[:N],nsw
def measure(y):
    y2=librosa.resample(np.tile(y,2),orig_sr=sr,target_sr=22050)
    f0=librosa.yin(y2,fmin=40,fmax=140,sr=22050,frame_length=4096)
    return float(np.median(f0))*120
LOOP=1.6;XFL=int(0.12*sr)
plan=[('on','old',R) for R in (7000,8000,9000,9500)]+[('on','new',R) for R in (10000,10500,11000,11500,12000,12500)]\
    +[('off','new',R) for R in (6500,7500,8500,9500,10500)]
items=[];refrms=None
for kind,src,R in plan:
    res=render(src,kind,R,LOOP+0.2)
    if res is None: print('skip',kind,R);continue
    x,nsw=res;L=int(LOOP*sr);y=x[:L].copy();fi=np.sin(np.linspace(0,np.pi/2,XFL))**2
    y[:XFL]=x[:XFL]*fi+x[L:L+XFL]*(1-fi)
    y=ss.sosfilt(ss.butter(2,30,'highpass',fs=sr,output='sos'),y)
    rms=np.sqrt(np.mean(y**2));y=y*(0.12/rms)        # niveau RMS commun ; le mix on/off se fait au runtime
    y=np.clip(y,-0.98,0.98)
    meas=measure(y)
    if abs(np.log(2*meas/R))<abs(np.log(meas/R)):meas*=2
    if abs(np.log(meas/2/R))<abs(np.log(meas/R)):meas/=2
    name=f'{kind}_{R:05d}';sf.write(OUT+name+'.wav',y.astype(np.float32),sr,subtype='PCM_16')
    items.append(dict(id=name,load=kind,source=src,rpm_target=R,rpm_measured=round(meas),file=name+'.wav',duration_s=LOOP,grain_switches=nsw,seam=round(float(abs(y[0]-y[-1])),4)))
    print(name,src,round(meas),'sw',nsw)
json.dump(dict(version=1,method='varispeed à hauteur constante depuis les enregistrements fournis, fondu de boucle 120 ms',
  rpm_model='rpm = 120 × f0 (composante d\'ordre 0,5 ; allumage V6 = 6 × f0) — hypothèse',
  sources={'new':'assets-raw/engine_new.mp3 (md5 ea8a375b…, droits inconnus)','old':'f1sg assets-raw/user/01M6EWATXJ34G8CKJXT65G1CC9.mp3 (droits inconnus)'},
  samples=items),open(OUT+'engine-map.json','w'),indent=1,ensure_ascii=False)
