#!/usr/bin/env python3
"""Patch « IA / TV / collisions / stabilité » pour project-w11-mercedes-spa.

Usage, depuis la RACINE du dépôt :
    python3 w11_patch.py --dry-run          # vérifie que tout s'applique, n'écrit rien
    python3 w11_patch.py                    # applique tout
    python3 w11_patch.py ia stabilite       # seulement certains groupes

Groupes :
    ia          contacts joueur ↔ IA par enveloppes orientées (plus de traversée, impulsion symétrique),
                TV / spectateur : détail maximal + physique complète recentrée sur la voiture regardée
    stabilite   échelle d'adaptation sans paliers inutiles sur iPhone, envoi des textures de tuiles étalé,
                log mémoire espacé, overlay perf (p95 / pire image)
    tcam        sensation de vitesse en T-cam (champ qui s'élargit, buffeting)
    hud         HUD de course sans backdrop-filter (flou coûteux sur canevas animé)

Chaque remplacement exige UNE occurrence exacte du texte d'origine ; si une seule ne correspond pas,
rien n'est écrit. Idempotent : un remplacement déjà appliqué est ignoré.
Après application : cd source/game && npx tsc --noEmit && npx tsx tests/race_game.test.ts 2 150
                    puis HYBRID=1 npx tsx tests/race_game.test.ts 2 150
"""
import pathlib
import sys

EDITS = []  # (groupe, fichier, ancien, nouveau)


def edit(group, path, old, new):
    EDITS.append((group, path, old, new))


SIM = 'source/game/src/race/sim.ts'
HYB = 'source/game/src/race/hybrid.ts'
FV = 'source/game/src/render/fieldView.ts'
MAIN = 'source/game/src/main.ts'
QUAL = 'source/game/src/quality/quality.ts'
CAM = 'source/game/src/render/cameras.ts'
REN = 'source/game/src/render/renderer.ts'
TEST = 'source/game/tests/race_game.test.ts'
STYLE = 'source/game/src/ui/style.css'
APPLE = 'source/game/src/ui/apple.css'

# ─────────────────────────── ia : collisions (sim.ts)
edit('ia', SIM,
     r"""  private contacts() {
    const A = this.cars""",
     r"""  private contacts() {
    const A = this.cars
    // joueur ↔ voitures : enveloppes orientées en repère monde (SAT), avant les contacts en repère piste
    if (this.hullCollisions && this.player.player && this.vehicle) for (const o of A) if (o !== this.player) this.hullContact(this.player, o)""")

edit('ia', SIM,
     r"""      if (p.player || q.player) { this.playerContact(p.player ? p : q, p.player ? q : p, sideHit); continue }""",
     r"""      if (p.player || q.player) { if (!this.hullCollisions) this.playerContact(p.player ? p : q, p.player ? q : p, sideHit); continue }""")

edit('ia', SIM,
     r"""  private contactDamage(rear: Racer, front: Racer, dv: number, side: boolean) {""",
     r"""  /** voiture suivie en mode TV / spectateur : la physique complète (hybride) se recentre sur elle ; null = le joueur */
  focus: Racer | null = null
  /** nombre maximal d'IA en physique complète : 4 en jeu, davantage en mode TV */
  hybridMax = 4
  /** contacts joueur ↔ voitures par enveloppes orientées (SAT) ; false (?hull=0) : anciens contacts en repère piste */
  hullCollisions = true
  private hn = { nx: 0, nz: 0, pen: 0 }
  /** une épave (abandon) encore visible sur la piste est un obstacle plein : plus de traversée */
  private wreckSolid(r: Racer) {
    if (r.mode !== 'dnf') return false
    const x = r as Racer & { _gone?: boolean; _goneAt?: number }
    return !x._gone && !(x._goneAt !== undefined && this.t > x._goneAt)
  }
  /** deux rectangles orientés (théorème de l'axe séparateur) : normale unitaire de B vers A et pénétration minimale, ou null s'ils ne se touchent pas */
  private hullOverlap(ax: number, az: number, afx: number, afz: number, bx: number, bz: number, bfx: number, bfz: number) {
    const HL = 2.7, HW = 0.95 // demi-longueur / demi-largeur d'une F1 2020 (5,4 × 1,9 m : 5,5 × 2,0 m moins la tolérance aileron / roue)
    const dx = ax - bx, dz = az - bz, arx = -afz, arz = afx, brx = -bfz, brz = bfx
    let best = Infinity, bnx = 0, bnz = 0
    for (let k = 0; k < 4; k++) {
      const ux = k === 0 ? afx : k === 1 ? arx : k === 2 ? bfx : brx
      const uz = k === 0 ? afz : k === 1 ? arz : k === 2 ? bfz : brz
      const ra = HL * Math.abs(afx * ux + afz * uz) + HW * Math.abs(arx * ux + arz * uz)
      const rb = HL * Math.abs(bfx * ux + bfz * uz) + HW * Math.abs(brx * ux + brz * uz)
      const proj = dx * ux + dz * uz, ov = ra + rb - Math.abs(proj)
      if (ov <= 0) return null
      if (ov < best) { best = ov; const sg = proj >= 0 ? 1 : -1; bnx = ux * sg; bnz = uz * sg }
    }
    this.hn.nx = bnx; this.hn.nz = bnz; this.hn.pen = best
    return this.hn
  }
  /** contact joueur ↔ voiture, enveloppes orientées (SAT) : sortie d'interpénétration à chaque pas (plus de traversée, épaves comprises),
   *  impulsion symétrique (le joueur et l'IA reçoivent la même ; Vehicle.carHit des deux côtés si l'IA est en physique complète), dégâts et pénalités comme avant */
  private hullContact(pl: Racer, ai: Racer) {
    const c = this.vehicle; if (!c || !this.onTrack(pl)) return
    const wreck = this.wreckSolid(ai)
    if (!wreck && !this.onTrack(ai)) return
    const dx = pl.wx - ai.wx, dz = pl.wz - ai.wz
    if (dx * dx + dz * dz > 38) return // plus de 6,2 m entre centres : aucun contact possible
    const pf = Math.hypot(c.R[6], c.R[8]) || 1, pfx = -c.R[6] / pf, pfz = -c.R[8] / pf
    const af = Math.hypot(ai.hx, ai.hz) || 1, afx = ai.hx / af, afz = ai.hz / af
    const hit = this.hullOverlap(pl.wx, pl.wz, pfx, pfz, ai.wx, ai.wz, afx, afz)
    if (!hit) return
    const nx = hit.nx, nz = hit.nz, pen = hit.pen // n : de l'IA vers le joueur
    const av = this.drives(ai) ? (this.hybridBank?.vehicleOf(ai) ?? null) : null
    const avx = wreck ? 0 : av ? av.vel[0] : ai.hx * ai.v, avz = wreck ? 0 : av ? av.vel[2] : ai.hz * ai.v
    const dvn = -((c.vel[0] - avx) * nx + (c.vel[2] - avz) * nz) // > 0 : elles se rapprochent
    // 1) sortir de l'interpénétration (≤ 0,35 m par pas) : une IA physique partage à parts égales ; une IA 1D ou une épave ne se déplace pas, le joueur reprend tout
    const push = Math.min(0.35, pen + 0.01), kp = av ? 0.5 : 1
    c.pos[0] += nx * push * kp; c.pos[2] += nz * push * kp; pl.wx = c.pos[0]; pl.wz = c.pos[2]
    if (av) { av.pos[0] -= nx * push * (1 - kp); av.pos[2] -= nz * push * (1 - kp); ai.wx = av.pos[0]; ai.wz = av.pos[2] }
    else if (!wreck) { ai.d += (ai.d - pl.d >= 0 ? 1 : -1) * 0.05; ai.off = ai.d; ai.sepT = 0.45 }
    if (dvn <= 0.05) return
    // 2) impulsion : mêmes règles pour les deux voitures (masses égales : 0,55 × la vitesse de rapprochement chacune) ; contre une épave, tout pour le joueur
    const fwd = -(c.R[6] * nx + c.R[8] * nz) // > 0 : l'IA est derrière le joueur
    const right = c.R[0] * nx + c.R[2] * nz
    const side = Math.abs(right) > Math.abs(fwd)
    const part = side ? (right > 0 ? (fwd < 0 ? 10 : 12) : (fwd < 0 ? 11 : 13)) : fwd < 0 ? 1 : (this.rng.next() < 0.5 ? 2 : 12 + (right > 0 ? 0 : 1))
    c.carHit(nx, nz, dvn, part)
    if (wreck) { c.vel[0] += nx * dvn * 0.55; c.vel[2] += nz * dvn * 0.55 }
    else if (av) {
      const nfa = afx * nx + afz * nz, nra = -afz * nx + afx * nz // composantes de n sur l'avant et la droite de l'IA
      av.carHit(-nx, -nz, dvn, side ? (nra > 0 ? (nfa > 0 ? 11 : 13) : (nfa > 0 ? 10 : 12)) : nfa > 0 ? 1 : 2)
      ai.v = Math.max(0, av.forwardSpeed()) // sinon nudge() annulerait l'impulsion reçue
    } else {
      ai.v = Math.max(0, ai.v - dvn * 0.55 * (afx * nx + afz * nz))
      ai.d += (ai.d - pl.d >= 0 ? 1 : -1) * Math.min(0.4, dvn * 0.05); ai.lat *= 0.3
    }
    const rearIsPlayer = !side && fwd < 0
    this.contactDamage(rearIsPlayer ? pl : ai, rearIsPlayer ? ai : pl, dvn, side)
  }
  private contactDamage(rear: Racer, front: Racer, dv: number, side: boolean) {""")

# ─────────────────────────── ia : TV / spectateur (hybrid.ts, fieldView.ts, main.ts)
edit('ia', HYB,
     r"""const MAX = 4""",
     r"""const MAX = 6 // emplacements alloués ; sim.hybridMax (4 en jeu, 6 en mode TV) borne le nombre réellement actif""")

edit('ia', HYB,
     r"""    const p = sim.player
    const pool = sim.cars.filter(o => o !== p && sim.onTrack(o)""",
     r"""    const pl = sim.player
    // mode TV / spectateur : la physique complète se recentre sur la voiture regardée (le joueur est alors arrêté ou hors course)
    const p = sim.focus && sim.focus !== pl ? sim.focus : pl
    const cap = Math.max(1, Math.min(MAX, Math.round(sim.hybridMax))), half = Math.ceil(cap / 2)
    const pool = sim.cars.filter(o => o !== pl && sim.onTrack(o)""")

edit('ia', HYB,
     r"""    const ideal: Racer[] = [...ahead.slice(0, 2), ...behind.slice(0, 2)]
    for (const o of [...ahead.slice(2), ...behind.slice(2)]) { if (ideal.length >= MAX) break; ideal.push(o) }""",
     r"""    const ideal: Racer[] = [...ahead.slice(0, half), ...behind.slice(0, cap - half)]
    for (const o of [...ahead.slice(half), ...behind.slice(cap - half)]) { if (ideal.length >= cap) break; ideal.push(o) }""")

edit('ia', HYB,
     r"""      if (rank >= 0 && rank < 6) keep.push(r)""",
     r"""      if (rank >= 0 && rank < cap + 2) keep.push(r)""")

edit('ia', HYB,
     r"""    for (const r of keep) { if (next.length < MAX) next.push(r) }
    for (const r of ideal) { if (next.length >= MAX) break; if (!next.includes(r)) next.push(r) }""",
     r"""    for (const r of keep) { if (next.length < cap) next.push(r) }
    for (const r of ideal) { if (next.length >= cap) break; if (!next.includes(r)) next.push(r) }""")

edit('ia', HYB,
     r"""  active(r: Racer) { return this.slots.some(s => s.r === r) }""",
     r"""  active(r: Racer) { return this.slots.some(s => s.r === r) }
  /** corps rigide d'une IA en physique complète (null si elle est en 1D) : contacts, impulsions */
  vehicleOf(r: Racer): Vehicle | null { for (const s of this.slots) if (s.r === r) return s.v; return null }""")

edit('ia', FV,
     r"""  update(sim: RaceSim, dt: number, cam: THREE.Camera) {
    if (!this.ready) return
    const t = performance.now() / 1000
    for (const v of this.views) {
      const r = v.r""",
     r"""  /** vrai en caméra TV / spectateur : toutes les IA gardent le meilleur modèle bien plus loin (le zoom télé les agrandit) et ne sont plus masquées */
  tvBoost = false
  update(sim: RaceSim, dt: number, cam: THREE.Camera) {
    if (!this.ready) return
    const t = performance.now() / 1000
    // niveaux de détail : seuils exprimés pour un champ de 60° ; un champ étroit (zoom TV) agrandit les voitures à l'écran, donc le meilleur modèle reste plus loin
    const zk = Math.max(0.8, Math.min(8, Math.tan(Math.PI / 6) / Math.tan(Math.max(3, Math.min(120, (cam as THREE.PerspectiveCamera).fov || 60)) * Math.PI / 360)))
    const d1 = (this.tvBoost ? 150 : 55) * zk, d2 = (this.tvBoost ? 1200 : 450) * zk
    for (const v of this.views) {
      const r = v.r
      v.obj.levels[1].distance = d1; v.obj.levels[2].distance = d2""")

edit('ia', MAIN,
     r"""F.difficulty = settings.profile.difficulty""",
     r"""F.difficulty = settings.profile.difficulty
  F.hullCollisions = new URLSearchParams(location.search).get('hull') !== '0' // ?hull=0 : anciens contacts en repère piste (comparer)""")

edit('ia', MAIN,
     r"""if (game.spectate && game.spectate !== 'tv' && fview) {""",
     r"""if (fview && game.field) {
      // TV / spectateur : tous les modèles au détail maximal ; la physique complète se concentre sur la voiture regardée (pas sur le joueur arrêté)
      const tv = ren.cams?.mode === 'tv' || !!game.spectate
      fview.tvBoost = tv
      game.field.focus = game.spectate === 'tv' ? game.field.leader() : game.spectate ? (fview.views.find(x => x.r.id === game.spectate)?.r ?? null) : null
      game.field.hybridMax = tv && !adapt.lock30 && adapt.fx < 3 ? 6 : 4
    }
    if (game.spectate && game.spectate !== 'tv' && fview) {""")

edit('ia', TEST,
     r"""F.ctrl.startFormation(); F.ctrl.skipFormation()""",
     r"""F.ctrl.startFormation(); F.ctrl.skipFormation()
if (process.env.HYBRID === '1') F.hybridOn = true // physique complète pour les IA proches du joueur, comme en jeu""")

edit('ia', TEST,
     r"""if (t0 >= 0 && F.t - t0 > SEC) break
}""",
     r"""if (t0 >= 0 && F.t - t0 > SEC) break
}
for (const r of F.cars) if (![r.s, r.d, r.v, r.wx, r.wz].every(Number.isFinite)) { console.error('ÉCHEC : état non fini pour', r.code); process.exit(1) }
console.log('ok : états finis,', F.cars.length, 'voitures')""")

# ─────────────────────────── stabilite
edit('stabilite', QUAL,
     r"""export const ADAPT_LADDER: [number, number][] = [[1, 0], [1, 1], [1, 2], [1, 3], [0.92, 3], [0.85, 3]]""",
     r"""export const ADAPT_LADDER: [number, number][] = [[1, 0], [1, 1], [1, 2], [1, 3], [0.92, 3], [0.85, 3]]
/** sans GTAO ni bloom (iPhone en Haute) : les paliers 1 et 2 coupent des effets absents et ne changent rien → on les saute, la réaction à une surcharge est 2 à 3× plus rapide */
export const ADAPT_LADDER_NOPOST: [number, number][] = [[1, 0], [1, 3], [0.92, 3], [0.85, 3]]""")

edit('stabilite', QUAL,
     r"""  step = 0; private acc = 0; private n = 0; private hold = 0""",
     r"""  step = 0; private acc = 0; private n = 0; private hold = 0
  private ladder = ADAPT_LADDER
  private ft = new Float32Array(120); private fti = 0""")

edit('stabilite', QUAL,
     r"""  get scale() { return ADAPT_LADDER[this.step][0] }
  get fx() { return ADAPT_LADDER[this.step][1] }""",
     r"""  get scale() { return this.ladder[this.step][0] }
  get fx() { return this.ladder[this.step][1] }
  /** dernier palier à pleine résolution : au-delà on baisse la résolution, c'est donc ici qu'on bascule à 30 i/s */
  private get lastFx() { let k = 0; for (let i = 0; i < this.ladder.length; i++) if (this.ladder[i][0] === 1) k = i; return k }
  /** à appeler une fois le moteur de rendu créé : échelle sans paliers inutiles (n'agit que tant que rien n'a été dégradé) */
  setNoPost(on: boolean) { const want = on ? ADAPT_LADDER_NOPOST : ADAPT_LADDER; if (want !== this.ladder && this.step === 0 && !this.lock30) this.ladder = want }
  /** enregistre la durée d'une image (anneau de 120) pour l'overlay de performances */
  track(ms: number) { this.ft[this.fti++ % 120] = Math.min(ms, 1000) }
  /** p95 / pire image / images > 25 ms sur les ~2 dernières secondes : la moyenne cache les saccades */
  stats() {
    const n = Math.min(this.fti, 120); if (n < 10) return ''
    const a = Array.from(this.ft.subarray(0, n)).sort((x, y) => x - y)
    let spikes = 0; for (const v of a) if (v > 25) spikes++
    return `p95 ${a[Math.floor(n * 0.95)].toFixed(0)} ms · pire ${a[n - 1].toFixed(0)} · >25 ms ×${spikes}`
  }""")

edit('stabilite', QUAL,
     r"""if (this.step === 3 && !this.lock30 && this.targetMs < 25) { this.lock30 = true; this.targetMs = 1000 / 30; this.step = 1; this.hold = 120; return true }
      this.step = Math.min(ADAPT_LADDER.length - 1, this.step + 1)""",
     r"""if (this.step === this.lastFx && !this.lock30 && this.targetMs < 25) { this.lock30 = true; this.targetMs = 1000 / 30; this.step = this.ladder === ADAPT_LADDER ? 1 : 0; this.hold = 120; return true }
      this.step = Math.min(this.ladder.length - 1, this.step + 1)""")

edit('stabilite', MAIN,
     r"""ren.onTile = root => bindPit(root)""",
     r"""ren.onTile = root => bindPit(root)
    adapt.setNoPost(!ren.q.gtao && !ren.q.bloom)""")

edit('stabilite', MAIN,
     r"""fpsAcc += dtMs; fpsN++""",
     r"""fpsAcc += dtMs; fpsN++; adapt.track(dtMs)""")

edit('stabilite', MAIN,
     r"""${ren.tiles?.total ?? 0}`; fpsAcc = 0; fpsN = 0 }""",
     r"""${ren.tiles?.total ?? 0} · ${adapt.stats()}`; fpsAcc = 0; fpsN = 0 }""")

edit('stabilite', REN,
     r"""  memLog(lbl: string) {
    const m = this.r.info.memory, e = this.gpuEstimate(), M = (b: number) => (b / 1048576).toFixed(0)""",
     r"""  private memLogT = 0
  memLog(lbl: string) {
    // en jeu, une tuile qui entre ou sort ne doit pas relancer un parcours complet de la scène (pic d'image au pire moment) : au plus une estimation toutes les 20 s
    if (this.cams && lbl.startsWith('tuile ')) { const now = performance.now(); if (now - this.memLogT < 20000) return; this.memLogT = now }
    const m = this.r.info.memory, e = this.gpuEstimate(), M = (b: number) => (b / 1048576).toFixed(0)""")

edit('stabilite', REN,
     r"""root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'] as const) if (mt[k]) this.r.initTexture(mt[k]!) })""",
     r"""const texs = new Set<THREE.Texture>()
      root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'] as const) if (mt[k]) texs.add(mt[k]!) })
      // envoi au GPU étalé : une grosse texture d'un coup = un pic d'image ; on travaille ~4 ms puis on rend la main (les images continuent d'être dessinées)
      let tu = performance.now()
      for (const tx of texs) { this.r.initTexture(tx); if (performance.now() - tu > 4) { await new Promise<void>(res => setTimeout(res, 0)); tu = performance.now() } }""")

# ─────────────────────────── tcam
edit('tcam', CAM,
     r"""const a = this.shake * (ck ? 0.006 : 0.009) + Math.min(1, speed / 90) * 0.0006, eng = 0.00025
        this.pos.x += Math.sin(t * 61) * a + Math.sin(t * 173) * eng; this.pos.y += Math.sin(t * 47 + 1) * a + Math.sin(t * 211 + 2) * eng""",
     r"""const sp = Math.min(1, speed / 90), buf = sp * sp * (ck ? 0.0007 : 0.0032) // buffeting aéro ∝ v², bien plus marqué sur la T-cam (fixée à la carrosserie)
        const a = this.shake * (ck ? 0.006 : 0.009) + sp * 0.0006, eng = 0.00025
        this.pos.x += Math.sin(t * 61) * a + Math.sin(t * 173) * eng + (Math.sin(t * 83 + 3) + 0.5 * Math.sin(t * 137 + 1)) * buf
        this.pos.y += Math.sin(t * 47 + 1) * a + Math.sin(t * 211 + 2) * eng + (Math.sin(t * 97 + 2) + 0.5 * Math.sin(t * 151)) * buf""")

edit('tcam', CAM,
     r"""else c.rotateX(-0.05)""",
     r"""else { c.rotateX(-0.05); c.rotateZ(Math.sin(t * 29) * sp * sp * 0.0018) }""")

edit('tcam', CAM,
     r"""fov = ck ? this.cockpitFov : 62""",
     r"""fov = ck ? this.cockpitFov + 3 * sp ** 1.4 : 62 + 12 * sp ** 1.3 // sensation de vitesse : le champ s'élargit avec la vitesse (T-cam 62° → 74°)""")

# ─────────────────────────── hud
edit('hud', STYLE,
     r""".pill{background:var(--glass);border:1px solid var(--line);border-radius:10px;padding:5px 9px;font-size:12px;font-weight:600;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}""",
     r""".pill{background:rgba(14,14,18,.72);border:1px solid var(--line);border-radius:10px;padding:5px 9px;font-size:12px;font-weight:600}""")
edit('hud', STYLE,
     r"""background:var(--glass);color:#fff;font-size:14px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}""",
     r"""background:rgba(14,14,18,.72);color:#fff;font-size:14px}""")
edit('hud', STYLE,
     r"""background:rgba(28,28,30,.62);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);""",
     r"""background:rgba(28,28,30,.84);""")
edit('hud', APPLE,
     r"""background:rgba(10,10,12,.72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}""",
     r"""background:rgba(10,10,12,.84)}""")
edit('hud', APPLE,
     r"""background:rgba(12,12,16,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:10px;""",
     r"""background:rgba(12,12,16,.82);border-radius:10px;""")

GROUPS = ['ia', 'stabilite', 'tcam', 'hud']


def apply(root, groups, dry=False):
    """Retourne (code de sortie, messages). Rien n'est écrit si un seul remplacement échoue."""
    by_file, out, msgs, errors = {}, {}, [], []
    for g, path, old, new in EDITS:
        if g in groups:
            by_file.setdefault(path, []).append((g, old, new))
    for path, edits in by_file.items():
        p = pathlib.Path(root) / path
        if not p.exists():
            errors.append(f'fichier introuvable : {path}')
            continue
        with open(p, encoding='utf-8', newline='') as f:
            text = f.read()
        done = 0
        for g, old, new in edits:
            if new in text:
                msgs.append(f'  déjà appliqué  [{g}] {path} : {new.strip().splitlines()[0][:60]}')
                continue
            n = text.count(old)
            if n != 1:
                errors.append(f'  ÉCHEC [{g}] {path} : {n} occurrence(s) de « {old.strip().splitlines()[0][:70]} » (attendu : 1)')
                continue
            text = text.replace(old, new, 1)
            done += 1
        out[path] = (text, done)
    if errors:
        return 1, msgs + errors + ['Rien n\'a été écrit.']
    for path, (text, done) in out.items():
        msgs.append(f'  {path} : {done} remplacement(s)' + (' (simulation)' if dry else ''))
        if not dry and done:
            with open(pathlib.Path(root) / path, 'w', encoding='utf-8', newline='') as f:
                f.write(text)
    return 0, msgs


def main(argv):
    dry = '--dry-run' in argv
    groups = [a for a in argv if not a.startswith('--')] or GROUPS
    bad = [g for g in groups if g not in GROUPS]
    if bad:
        print('groupe(s) inconnu(s) :', ', '.join(bad), '— disponibles :', ', '.join(GROUPS))
        return 2
    code, msgs = apply('.', groups, dry)
    print('\n'.join(msgs))
    print('OK' if code == 0 else 'ÉCHEC')
    return code


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
