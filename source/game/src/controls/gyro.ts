/** Angle de « volant » (degrés, + = tourner à droite / sens horaire vu par le joueur) à partir des angles
 *  DeviceOrientation (beta, gamma, en degrés) et de l'orientation de l'écran (0, 90, 180, 270 / -90).
 *  Méthode : on reconstruit la verticale (gravité) dans le repère de l'appareil — u = (−sinγ·cosβ, sinβ, cosγ·cosβ)
 *  (convention W3C Z-X'-Y'') — puis on mesure son angle dans le plan de l'écran, par rapport au « haut » de l'écran
 *  courant. Robuste quand l'écran est presque vertical (blocage de cardan de beta/gamma) et indépendant de alpha (boussole).
 *  Paysage gauche ou droite : géré par screen.orientation.angle (ou window.orientation sur ancien iOS). */
export function wheelAngleDeg(beta: number, gamma: number, screenAngle: number): number {
  const d = Math.PI / 180, b = beta * d, g = gamma * d
  const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b)
  const a = ((Math.round(screenAngle) % 360) + 360) % 360
  // « haut » de l'écran exprimé dans le repère appareil, puis axe « droite » de l'écran
  let upx = 0, upy = 1
  if (a === 90) { upx = 1; upy = 0 } else if (a === 270) { upx = -1; upy = 0 } else if (a === 180) { upx = 0; upy = -1 }
  const rx = upy, ry = -upx // droite de l'écran = haut tourné de −90°
  // la gravité « haut » tourne dans le sens inverse de l'appareil : volant à droite → u penche vers la droite écran… inversé
  const cu = ux * upx + uy * upy, cr = ux * rx + uy * ry
  return -Math.atan2(cr, cu) / d
}
export function currentScreenAngle(): number {
  const so = (globalThis as unknown as { screen?: { orientation?: { angle?: number } } }).screen?.orientation?.angle
  if (typeof so === 'number') return so
  const wo = (globalThis as unknown as { orientation?: number }).orientation
  return typeof wo === 'number' ? wo : 0
}
