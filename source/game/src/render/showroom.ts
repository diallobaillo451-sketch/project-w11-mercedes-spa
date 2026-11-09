/** Vitrine 3D du menu : la VRAIE voiture du jeu (même maillage, mêmes textures → aucune mémoire en plus) posée dans un
 *  studio (sol laqué à fondu radial, fond dégradé, éclairage clé / contre-jour / remplissage, ombre douce), plateau
 *  tournant et caméra « ressort » (cadrages voiture / pilote / casque), glisser pour tourner. Thème clair / sombre. */
import * as THREE from 'three'

export type ShowShot = 'hero' | 'driver' | 'helmet' | 'side' | 'rear'
const SHOTS: Record<ShowShot, { yaw: number; pitch: number; dist: number; tgt: [number, number, number]; fov: number }> = {
  hero:   { yaw: 0.75, pitch: 0.15, dist: 10.2, tgt: [0, 0.4, -0.1], fov: 28 },
  side:   { yaw: 1.57, pitch: 0.08, dist: 11.5, tgt: [0, 0.45, 0], fov: 26 },
  rear:   { yaw: 2.45, pitch: 0.18, dist: 9.6, tgt: [0, 0.45, 0.2], fov: 28 },
  driver: { yaw: 0.95, pitch: 0.28, dist: 3.3, tgt: [0, 0.75, 0.2], fov: 26 },
  helmet: { yaw: 0.75, pitch: 0.16, dist: 1.25, tgt: [0, 0.0, 0], fov: 24 },
}
export class Showroom {
  scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(28, 1, 0.05, 200); active = false
  private key = new THREE.DirectionalLight(0xfff4e8, 1.8); private rim = new THREE.DirectionalLight(0xbfd8ff, 2.2); private fill = new THREE.DirectionalLight(0xffffff, 0.6)
  private hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1a1a1f, 0.35)
  floor: THREE.Mesh; private bg: THREE.Mesh; private bgU = { cTop: { value: new THREE.Color() }, cBot: { value: new THREE.Color() }, cGlow: { value: new THREE.Color() } }
  private floorM: THREE.MeshPhysicalMaterial
  private yaw = 0.75; private pitch = 0.16; private dist = 8.2; private tgt = new THREE.Vector3(0, 0.45, -0.2); private fov = 28
  private vYaw = 0; private vPitch = 0; private vDist = 0; private vTgt = new THREE.Vector3(); private vFov = 0
  shot: ShowShot = 'hero'; spin = true; private userYaw = 0; private dragging = false; private idleT = 0
  private carParent: THREE.Object3D | null = null; private carPos = new THREE.Vector3(); private carQ = new THREE.Quaternion()
  helmet: THREE.Object3D | null = null
  /** voiture sur cales (garage) */
  lift = 0; private liftY = 0; private liftV = 0; private carRef: THREE.Object3D | null = null
  light = false
  constructor() {
    const g = new THREE.CircleGeometry(14, 96).rotateX(-Math.PI / 2)
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d')!
    const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#fff'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256)
    const am = new THREE.CanvasTexture(cv)
    this.floorM = new THREE.MeshPhysicalMaterial({ color: 0x18191c, roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.06, specularIntensity: 0.5, envMapIntensity: 0.05, transparent: true, alphaMap: am, depthWrite: false })
    this.floor = new THREE.Mesh(g, this.floorM); this.floor.receiveShadow = true; this.floor.renderOrder = -1
    // ombre de contact douce sous la voiture (le sol sombre rend l'ombre portée peu lisible)
    const cs = document.createElement('canvas'); cs.width = cs.height = 128; const y = cs.getContext('2d')!
    const rg = y.createRadialGradient(64, 64, 2, 64, 64, 63); rg.addColorStop(0, 'rgba(0,0,0,0.8)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)')
    y.fillStyle = rg; y.fillRect(0, 0, 128, 128)
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 6.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false, opacity: 0.9 }))
    blob.position.y = 0.003; blob.renderOrder = 0; this.floor.add(blob)
    const sg = new THREE.SphereGeometry(60, 48, 24)
    this.bg = new THREE.Mesh(sg, new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: this.bgU,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 cTop, cBot, cGlow; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(cBot, cTop, smoothstep(-0.05, 0.6, h)); c += cGlow * exp(-pow((h - 0.02) * 9.0, 2.0)) * 0.6;
          float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0); }` }))
    this.key.position.set(5, 8, 4); this.key.castShadow = true
    const S = this.key.shadow; S.mapSize.set(1024, 1024); S.camera.left = S.camera.bottom = -4; S.camera.right = S.camera.top = 4; S.camera.near = 1; S.camera.far = 25; S.radius = 6; S.bias = -0.0004; S.normalBias = 0.02
    this.rim.position.set(-6, 4, -6); this.fill.position.set(-5, 2, 6)
    this.scene.add(this.floor, this.bg, this.key, this.key.target, this.rim, this.fill, this.hemi)
    this.setTheme(matchMedia('(prefers-color-scheme: light)').matches)
  }
  setTheme(light: boolean) {
    this.light = light
    if (light) { this.bgU.cTop.value.set(0xeef1f6); this.bgU.cBot.value.set(0xc9ced6); this.bgU.cGlow.value.set(0xffffff); this.floorM.color.set(0xd8dce2); this.hemi.intensity = 0.7 }
    else { this.bgU.cTop.value.set(0x07080b); this.bgU.cBot.value.set(0x15171c); this.bgU.cGlow.value.set(0x223348); this.floorM.color.set(0x0c0d10); this.hemi.intensity = 0.3 }
  }
  enter(car: THREE.Object3D, env: THREE.Texture | null) {
    if (this.active) return
    this.active = true; this.carParent = car.parent; this.carPos.copy(car.position); this.carQ.copy(car.quaternion)
    this.carRef = car; this.liftY = 0; this.scene.add(car); car.position.set(0, 0, 0); car.quaternion.identity(); car.updateMatrixWorld(true)
    this.scene.environment = env; this.scene.environmentIntensity = this.light ? 0.5 : 0.32; this.floorM.envMap = env; this.floorM.envMapIntensity = this.light ? 0.12 : 0.05
    this.helmet = null; car.traverse(o => { if (!this.helmet && /^Helmet_Base/.test(o.name)) this.helmet = o })
    // sol posé sous les pneus (l'origine du groupe voiture est au centre de gravité)
    let minY = Infinity; const bb = new THREE.Box3()
    car.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && /tyre|tire|wheel|pneu|rim/i.test(m.name)) { m.geometry.computeBoundingBox(); bb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld); minY = Math.min(minY, bb.min.y) } })
    this.floor.position.y = isFinite(minY) && minY > -0.6 ? minY : -0.29
  }
  exit(car: THREE.Object3D) {
    if (!this.active) return
    this.scene.environment = null; this.floorM.envMap = null
    this.active = false; (this.carParent ?? this.scene).add(car); car.position.copy(this.carPos); car.quaternion.copy(this.carQ); car.updateMatrixWorld(true)
    this.key.shadow.map?.dispose(); (this.key.shadow as unknown as { map: null }).map = null // ombre du studio libérée en course
  }
  setShot(s: ShowShot) { this.shot = s; this.idleT = 0 }
  drag(dx: number, dy: number) { this.dragging = true; this.userYaw -= dx * 0.008; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.02, 0.6); this.idleT = 0 }
  release() { this.dragging = false }
  private h = new THREE.Vector3()
  update(dt: number, aspect: number, leftPanel: number) {
    const S = SHOTS[this.shot]
    const tg = this.h.set(...S.tgt)
    if (this.shot === 'helmet' && this.helmet) { this.helmet.getWorldPosition(tg); tg.y += 0.02 }
    else if (this.shot === 'driver' && this.helmet) { this.helmet.getWorldPosition(tg); tg.y -= 0.12 }
    this.idleT += dt
    if (this.spin && !this.dragging && this.idleT > 2.5 && (this.shot === 'hero')) this.userYaw += dt * 0.12
    if (this.shot !== 'hero' && !this.dragging) this.userYaw *= Math.exp(-dt * 1.5)
    // ressort critique amorti (sensation « UIKit spring ») vers le cadrage voulu
    const k = 60, c = 2 * Math.sqrt(k) * 0.92, step = (x: number, v: number, to: number) => { const a = k * (to - x) - c * v; v += a * dt; return [x + v * dt, v] }
    ;[this.yaw, this.vYaw] = step(this.yaw, this.vYaw, S.yaw + this.userYaw); [this.pitch, this.vPitch] = this.dragging ? [this.pitch, 0] : step(this.pitch, this.vPitch, S.pitch)
    ;[this.dist, this.vDist] = step(this.dist, this.vDist, S.dist); [this.fov, this.vFov] = step(this.fov, this.vFov, S.fov)
    for (const ax of ['x', 'y', 'z'] as const) { const [p, v] = step(this.tgt[ax], this.vTgt[ax], tg[ax]); this.tgt[ax] = p; this.vTgt[ax] = v }
    ;[this.liftY, this.liftV] = step(this.liftY, this.liftV, this.lift * 0.06); if (this.carRef) this.carRef.position.y = this.liftY
    const cp = Math.cos(this.pitch)
    this.cam.position.set(this.tgt.x + Math.sin(this.yaw) * cp * this.dist, this.tgt.y + Math.sin(this.pitch) * this.dist, this.tgt.z - Math.cos(this.yaw) * cp * this.dist)
    this.cam.lookAt(this.tgt)
    // le panneau de verre couvre la gauche de l'écran : on décale l'image (setViewOffset) pour centrer la voiture à droite
    this.cam.fov = this.fov; this.cam.aspect = aspect
    const W = 1000, H = W / aspect, off = -leftPanel * 0.5 * W
    this.cam.setViewOffset(W, H, off, 0, W, H); this.cam.updateProjectionMatrix()
  }
}
