'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, Edges, Html, Outlines, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { db } from '@/lib/tools/lookup'
import type { PartStatus, Readiness } from '@/lib/readiness'
import type { Focus } from '@/lib/focus'
import { STATUS } from '../status'
import { frameFor, MESHES, meshPosition, type Finish, type MeshSpec, type Shape } from './model'

export interface TwinCanvasProps {
  readiness: Readiness
  focus: Focus
  framed: string[]
  exploded: boolean
  listening?: boolean
  onSelectPart: (id: string) => void
}

const ACCENT = '#4cc9f0'
const OVERVIEW: [number, number, number, number, number, number] = [2.5, 1.5, 3.1, 0, -0.1, 0]

const FINISH: Record<Finish, { color: string; metalness: number; roughness: number; opacity?: number }> = {
  metal: { color: '#9aa6b5', metalness: 0.75, roughness: 0.35 },
  dark: { color: '#2a3240', metalness: 0.4, roughness: 0.55 },
  solar: { color: '#1f3f8f', metalness: 0.5, roughness: 0.18 },
  gold: { color: '#d4a64a', metalness: 0.9, roughness: 0.3, opacity: 0.2 },
  white: { color: '#dfe5ec', metalness: 0.1, roughness: 0.6, opacity: 0.32 },
  shell: { color: '#8fb7d6', metalness: 0.2, roughness: 0.2, opacity: 0.07 },
  frame: { color: '#8fb7d6', metalness: 0, roughness: 1, opacity: 0.03 },
}
const SEE_THROUGH = new Set<Finish>(['gold', 'white', 'shell', 'frame'])

function Geometry({ shape }: { shape: Shape }) {
  switch (shape.kind) {
    case 'box': return <boxGeometry args={shape.size} />
    case 'cyl': return <cylinderGeometry args={[shape.rTop, shape.rBottom, shape.h, 28]} />
    case 'sphere': return <sphereGeometry args={[shape.r, 32, 20]} />
    case 'torus': return <torusGeometry args={[shape.r, shape.tube, 12, 48]} />
  }
}

const noRaycast = () => null

function PartMesh({ spec, status, lit, active, explode, onSelect, onHover, reduced }: {
  spec: MeshSpec
  status: PartStatus
  lit: boolean
  active: boolean
  explode: number
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  reduced: boolean
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const flash = useRef(0)
  const prev = useRef(status)
  const target = useMemo(() => new THREE.Vector3(), [])
  const statusColor = useMemo(() => new THREE.Color(STATUS[status].hex), [status])
  const finish = FINISH[spec.finish ?? 'metal']
  const seeThrough = SEE_THROUGH.has(spec.finish ?? 'metal')

  // A status change (what-if) flashes the part.
  useEffect(() => {
    if (prev.current !== status) flash.current = 1
    prev.current = status
  }, [status])

  useFrame((state, dt) => {
    const m = mesh.current
    const mt = mat.current
    if (!m || !mt) return
    target.set(...meshPosition(spec, explode))
    if (reduced) m.position.copy(target)
    else m.position.lerp(target, 1 - Math.exp(-dt * 5))
    mt.emissive.lerp(statusColor, 1 - Math.exp(-dt * 6))
    const t = state.clock.elapsedTime
    const pulse = status === 'blocked' && !reduced ? 0.55 + 0.45 * Math.sin(t * 4) : 1
    // At rest only problems glow; parts the agent has looked at light up whatever their status.
    const base = status === 'none' ? 0 : active ? 1.1 : lit ? 0.6 : status === 'verified' ? 0 : 0.35
    flash.current = Math.max(0, flash.current - dt * 0.8)
    mt.emissiveIntensity = (seeThrough ? base * 0.3 : base) * pulse + flash.current * 2.5
  })

  return (
    <mesh
      ref={mesh}
      position={spec.pos}
      rotation={spec.rot ?? [0, 0, 0]}
      raycast={seeThrough ? noRaycast : undefined}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(spec.partId) }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(spec.partId) }}
      onPointerOut={() => onHover(null)}
    >
      <Geometry shape={spec.shape} />
      <meshStandardMaterial
        ref={mat}
        color={finish.color}
        metalness={finish.metalness}
        roughness={finish.roughness}
        transparent={finish.opacity !== undefined}
        opacity={finish.opacity ?? 1}
        depthWrite={finish.opacity === undefined}
        emissive={STATUS[status].hex}
        emissiveIntensity={0}
      />
      {seeThrough && <Edges threshold={20} color={lit || status === 'blocked' ? STATUS[status].hex : '#3b5266'} />}
      {active && !seeThrough && <Outlines thickness={0.012} color={ACCENT} />}
    </mesh>
  )
}

/** Rotating scan ring around whatever the agent is looking at. */
function ScanRing({ center, radius, visible }: { center: [number, number, number]; radius: number; visible: boolean }) {
  const group = useRef<THREE.Group>(null)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const goal = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    pos.lerp(goal.set(...center), 1 - Math.exp(-dt * 5))
    const t = state.clock.elapsedTime
    g.position.set(pos.x, pos.y + Math.sin(t * 2) * radius * 0.35, pos.z)
    const s = THREE.MathUtils.lerp(g.scale.x, visible ? radius : 0.001, 1 - Math.exp(-dt * 6))
    g.scale.setScalar(s)
    g.rotation.y += dt * 1.6
  })
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <torusGeometry args={[1, 0.012, 8, 96]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[0.6, 1, 64, 1, 0, Math.PI / 3]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.12} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Pulsing halo while voice input is listening. */
function ListeningHalo({ on }: { on: boolean }) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((state, dt) => {
    const m = mesh.current
    if (!m) return
    const t = state.clock.elapsedTime
    const target = on ? 2.1 + Math.sin(t * 5) * 0.08 : 0.001
    m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, target, 1 - Math.exp(-dt * 8)))
  })
  return (
    <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <torusGeometry args={[1, 0.01, 8, 128]} />
      <meshBasicMaterial color="#ff6b7d" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function CameraRig({ framed, explode, rotate, reduced }: { framed: string[]; explode: number; rotate: boolean; reduced: boolean }) {
  const controls = useRef<CameraControls>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const key = framed.join(',')

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const f = framed.length ? frameFor(framed, explode) : undefined
    if (!f) { void c.setLookAt(...OVERVIEW, !reduced); return }
    const center = new THREE.Vector3(...f.center)
    // Look from outside the part, blended with the current view so the move reads as one motion.
    // Work in the horizontal plane, favour ±Z so the ±X solar wings stay out of the way, then
    // pick an elevation: almost level for the propulsion bay under the bus deck, higher elsewhere.
    const current = camera.position.clone().sub(c.getTarget(new THREE.Vector3())).setY(0).normalize()
    const outward = new THREE.Vector3(center.x, 0, center.z)
    const flat = (outward.length() > 0.1 ? outward.normalize().multiplyScalar(0.65) : new THREE.Vector3()).add(current.multiplyScalar(0.35))
    flat.x *= 0.5
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, 1)
    flat.normalize()
    const elevation = center.y < -0.55 ? 0.12 : 0.5
    const dir = flat.multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation))
    const dist = Math.max(1.4, (f.radius * 1.7) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)))
    const eye = center.clone().add(dir.multiplyScalar(dist))
    void c.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, !reduced)
  }, [key, explode]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    if (rotate && !reduced) void controls.current?.rotate(dt * 0.08, 0, true)
  })

  return <CameraControls ref={controls} minDistance={0.8} maxDistance={12} smoothTime={0.7} />
}

const REDUCED = '(prefers-reduced-motion: reduce)'
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false)
}

export default function TwinCanvas({ readiness, focus, framed, exploded, listening, onSelectPart }: TwinCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const reduced = usePrefersReducedMotion()
  const explode = exploded ? 1 : 0
  const lit = useMemo(() => new Set([...focus.touchedPartIds, ...focus.citedPartIds, ...framed]), [focus, framed])
  const active = useMemo(() => new Set(framed), [framed])
  const scanning = focus.phase === 'planning' || focus.phase === 'acting'
  const scan = (focus.phase === 'planning' ? undefined : frameFor(framed, explode)) ?? { center: [0, -0.1, 0] as [number, number, number], radius: 1.7 }

  const hoverPart = hovered ? db.parts.find((p) => p.id === hovered) : undefined
  const hoverFrame = hovered ? frameFor([hovered], explode) : undefined
  // Label up to four framed parts; more than that is a region, not a list.
  const labels = hovered || framed.length > 4 ? [] : framed.flatMap((id) => {
    const part = db.parts.find((p) => p.id === id)
    const f = frameFor([id], explode)
    return part && f ? [{ part, f }] : []
  })

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : ''
    return () => { document.body.style.cursor = '' }
  }, [hovered])

  return (
    <Canvas camera={{ position: [OVERVIEW[0], OVERVIEW[1], OVERVIEW[2]], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#bcd7ff', '#0b1118', 0.5]} />
      <directionalLight position={[5, 6, 4]} intensity={1.8} />
      <directionalLight position={[-4, -2, -3]} intensity={0.6} color={ACCENT} />
      <Stars radius={50} depth={25} count={1400} factor={2.2} saturation={0} fade speed={reduced ? 0 : 0.3} />

      <group>
        {MESHES.map((spec, i) => {
          const status = readiness.parts[spec.partId] ?? 'none'
          return (
            <PartMesh
              key={i}
              spec={spec}
              status={status}
              lit={lit.has(spec.partId)}
              active={active.has(spec.partId)}
              explode={explode}
              onSelect={onSelectPart}
              onHover={setHovered}
              reduced={reduced}
            />
          )
        })}
      </group>

      <ScanRing center={scan.center} radius={scan.radius} visible={scanning} />
      <ListeningHalo on={!!listening} />

      {hoverPart && hoverFrame && (
        <Html position={hoverFrame.center} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <PartLabel id={hoverPart.id} name={hoverPart.name} status={readiness.parts[hoverPart.id]} />
        </Html>
      )}
      {labels.map(({ part, f }, i) => (
        <Html key={part.id} position={[f.center[0], f.center[1] + (i % 2 ? -1 : 1) * (f.radius + 0.06), f.center[2]]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <PartLabel id={part.id} name={part.name} status={readiness.parts[part.id]} />
        </Html>
      ))}

      <CameraRig framed={framed} explode={explode} rotate={!hovered && framed.length === 0} reduced={reduced} />
    </Canvas>
  )
}

function PartLabel({ id, name, status }: { id: string; name: string; status: PartStatus }) {
  return (
    <div className="sg-rise whitespace-nowrap rounded border border-line-strong bg-canvas/90 px-2 py-1 font-mono text-[0.68rem] shadow-lg backdrop-blur">
      <span className="text-accent">{id}</span> <span className="text-ink">{name}</span>
      <span className="ml-1.5 inline-flex items-center gap-1" style={{ color: STATUS[status].color }}>
        <span className="size-1.5 rounded-full" style={{ background: STATUS[status].color }} />{STATUS[status].label}
      </span>
    </div>
  )
}
