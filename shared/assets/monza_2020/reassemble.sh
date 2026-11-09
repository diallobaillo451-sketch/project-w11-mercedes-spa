#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Reassembling preview/preview_top.png ..."
cat preview/preview_top.png.part* > "preview/preview_top.png"
echo "721ddb9161a3b4010c3c40f1b5de5b3bd862b450dc3e37891dc230051986a31d  preview/preview_top.png" | sha256sum -c -

echo "Reassembling scene/t01.bin ..."
cat scene/t01.bin.part* > "scene/t01.bin"
echo "15e0eb5fa33534d05dc734934772b896bf2aca8b1688204b0904bb063f998b09  scene/t01.bin" | sha256sum -c -

echo "Reassembling scene/t01_lod.bin ..."
cat scene/t01_lod.bin.part* > "scene/t01_lod.bin"
echo "85a501c58f43395ad6cb1e37ab05de618d9fe2c2603f1e02bad5409606b954bf  scene/t01_lod.bin" | sha256sum -c -

echo "Reassembling scene/t03.bin ..."
cat scene/t03.bin.part* > "scene/t03.bin"
echo "023bef56552cb6e3ea5d0254931dc25bf424705e517db813ea757cd77ec0a86a  scene/t03.bin" | sha256sum -c -

echo "Reassembling scene/t05.bin ..."
cat scene/t05.bin.part* > "scene/t05.bin"
echo "df36dda798e91f93cf300b8566b8103330955744c04b4aec6be660de8a8d73d4  scene/t05.bin" | sha256sum -c -

echo "Reassembling scene/t10.bin ..."
cat scene/t10.bin.part* > "scene/t10.bin"
echo "7f102bb733d0287cb6ccfa05227b3b4cd8501714a4b75e1db4cd2747d4156e1c  scene/t10.bin" | sha256sum -c -

echo "Reassembling scene/t10_lod.bin ..."
cat scene/t10_lod.bin.part* > "scene/t10_lod.bin"
echo "f2ff94d0e40575a3587d1f1011bfbb04994c24de2da652c6d8e4ed4ff2b6dca1  scene/t10_lod.bin" | sha256sum -c -

echo "Reassembling scene/t13.bin ..."
cat scene/t13.bin.part* > "scene/t13.bin"
echo "71b2f5f846e813804baf14b0dbb2eadeb584a52b60ad70549561c44f1ad30c89  scene/t13.bin" | sha256sum -c -

echo "Reassembling scene/t13_lod.bin ..."
cat scene/t13_lod.bin.part* > "scene/t13_lod.bin"
echo "e0b95f3164a885a381b0d3cf2f3f8879525972cf7d27bec59b8bcce7a0b5d752  scene/t13_lod.bin" | sha256sum -c -

echo "Reassembling scene/tex/081304809cc6053e.ktx2 ..."
cat scene/tex/081304809cc6053e.ktx2.part* > "scene/tex/081304809cc6053e.ktx2"
echo "bc0b80dc577c0898e130a3d05c407c424ce144f7b5cf84cdae49cbf390b59b54  scene/tex/081304809cc6053e.ktx2" | sha256sum -c -

echo "Reassembling scene/tex/15bcdf093e36afe1.ktx2 ..."
cat scene/tex/15bcdf093e36afe1.ktx2.part* > "scene/tex/15bcdf093e36afe1.ktx2"
echo "4bb24ea76fab4688f8e9bc985fc2251e93bfeae9827c399b269b1b4585d6c628  scene/tex/15bcdf093e36afe1.ktx2" | sha256sum -c -

echo "Reassembling scene/tex/33bf5cb059e8e28b.ktx2 ..."
cat scene/tex/33bf5cb059e8e28b.ktx2.part* > "scene/tex/33bf5cb059e8e28b.ktx2"
echo "60b00db43631d6a8a6060d5909941d993992a9dd4d594aa0f4ff353fa0ff4c01  scene/tex/33bf5cb059e8e28b.ktx2" | sha256sum -c -

echo "Reassembling scene/tex/7ec9cff9e7766363.ktx2 ..."
cat scene/tex/7ec9cff9e7766363.ktx2.part* > "scene/tex/7ec9cff9e7766363.ktx2"
echo "291f46042d72e11b24c51369d1d0457f621d230550249d7d640cffddf9acda1d  scene/tex/7ec9cff9e7766363.ktx2" | sha256sum -c -

echo "Reassembling scene/tex/c789a073aabb8ae3.ktx2 ..."
cat scene/tex/c789a073aabb8ae3.ktx2.part* > "scene/tex/c789a073aabb8ae3.ktx2"
echo "15629d9269016e1a0e2f57d670977113d6033514334dd5dbeec3b7b53b475154  scene/tex/c789a073aabb8ae3.ktx2" | sha256sum -c -

echo "Reassembling scene/tex/daf96da53b01d510.ktx2 ..."
cat scene/tex/daf96da53b01d510.ktx2.part* > "scene/tex/daf96da53b01d510.ktx2"
echo "54144d353038968c0e704c4b9e89da93c46f8b65dcee3c62fe5953bb9f282dd5  scene/tex/daf96da53b01d510.ktx2" | sha256sum -c -

echo "Reassembling scene/tex/f8a51fc5824d79e7.ktx2 ..."
cat scene/tex/f8a51fc5824d79e7.ktx2.part* > "scene/tex/f8a51fc5824d79e7.ktx2"
echo "5ba90cdfc5a09e37192894012e434c18ea781f87b6cc261dd76d500e6f1acbc6  scene/tex/f8a51fc5824d79e7.ktx2" | sha256sum -c -

echo "Reassembling track/surface.bin ..."
cat track/surface.bin.part* > "track/surface.bin"
echo "98c2141bef78f663940982cc17200d5fb234269bfc0b95bd6ab74f9159c17079  track/surface.bin" | sha256sum -c -

echo "OK — all split files reassembled and verified."
