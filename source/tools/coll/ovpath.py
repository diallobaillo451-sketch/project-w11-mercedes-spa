# superpose raster barrières (rouge), marches (bleu) et chemin des stands (vert) sur des rendus Blender vue de dessus
import numpy as np, cv2, json, sys
z = np.load('/workspace/w11/assets-work/coll/raster.npz'); x0, z0, PX = float(z['x0']), float(z['z0']), float(z['PX'])
P = json.load(open('/workspace/w11/game/public/track/pitlane.json'))
for spec in sys.argv[1:]:
    src, CX, CY, S, dst = spec.split(','); CX, CY, S = float(CX), float(CY), float(S)
    im = cv2.imread(src); H = im.shape[0]; k = H / S
    rr, cc = np.mgrid[0:H, 0:H]; X = CX + (cc - H / 2) / k; Zg = -(CY + (H / 2 - rr) / k)
    r = ((Zg - z0) / PX).astype(int); c = ((X - x0) / PX).astype(int)
    im[z['bar'][r, c] > 0] = (0, 0, 255); im[z['step'][r, c] > 0] = (255, 0, 0)
    for i, (x, zz) in enumerate(zip(P['x'], P['z'])):
        p = (int((x - CX) * k + H / 2), int(H / 2 - (-zz - CY) * k))
        cv2.circle(im, p, 5, (0, 255, 0), -1)
        if i % 25 == 0: cv2.putText(im, str(i), (p[0] + 6, p[1]), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 0), 2)
    cv2.imwrite(dst, cv2.resize(im, (800, 800)))
