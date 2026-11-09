import numpy as np
W='/workspace/w11/assets-work/audio/'
for name,tmax in (('new',112),('old',103)):
    d=np.load(W+name+'_track.npz');t=d['t'];r=d['f0']*120;db=20*np.log10(d['rms']+1e-9);c=d['conf']
    med=np.median(db[(t>2)&(t<tmax)])
    jump=np.abs(np.log(np.roll(r,-4)/np.roll(r,4)))>0.03
    ok=(t>1)&(t<tmax)&~jump&(c>2.5)
    on=ok&(db>med-2.5);off=ok&(db<med-5)
    print(name,'med dB',round(med,1))
    for R in range(4000,13001,500):
        w=np.abs(np.log(r/R))<0.04
        print(R,'on',round((on&w).sum()*256/22050,2),'s  off',round((off&w).sum()*256/22050,2),'s')
