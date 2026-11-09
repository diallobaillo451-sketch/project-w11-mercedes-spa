# superpose pitlane.json sur un rendu Blender vue de dessus (centre Blender cx,cy, taille m, image)
import json, cv2, sys
cxx, cyy, size, src, dst = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
im = cv2.imread(src); H = im.shape[0]; k = H / size
P = json.load(open('/workspace/w11/game/public/track/pitlane.json'))
for x, z in zip(P['x'], P['z']):
    c = int((x - cxx) * k + H / 2); r = int(H / 2 - (-z - cyy) * k)
    if 0 <= r < H and 0 <= c < H: cv2.circle(im, (c, r), 4, (255, 0, 255), -1)
cv2.imwrite(dst, cv2.resize(im, (900, 900)))
