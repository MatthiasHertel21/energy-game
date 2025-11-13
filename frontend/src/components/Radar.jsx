import React, { useMemo } from 'react'

// Simple Radar Chart (SVG) for up to N axes. Values expected in [0,1].
export default function Radar({ axes = [], axes2 = null, size = 260, levels = 4, color = '#1976d2', stroke = '#90caf9', color2 = '#2e7d32', stroke2 = '#a5d6a7' }) {
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.4
  const angleStep = (Math.PI * 2) / (axes.length || 1)

  const webs = useMemo(() => {
    const rings = []
    for (let l = 1; l <= levels; l++) {
      const r = (radius * l) / levels
      const pts = []
      for (let i = 0; i < axes.length; i++) {
        const a = i * angleStep - Math.PI / 2
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
      rings.push(pts)
    }
    return rings
  }, [axes.length, levels, radius, angleStep, cx, cy])

  const poly = useMemo(() => {
    const pts = []
    for (let i = 0; i < axes.length; i++) {
      const v = Math.max(0, Math.min(1, axes[i].value ?? 0))
      const a = i * angleStep - Math.PI / 2
      const r = v * radius
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    return pts
  }, [axes, angleStep, cx, cy, radius])

  const poly2 = useMemo(() => {
    if (!axes2) return null
    const pts = []
    for (let i = 0; i < axes2.length; i++) {
      const v = Math.max(0, Math.min(1, axes2[i].value ?? 0))
      const a = i * angleStep - Math.PI / 2
      const r = v * radius
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    return pts
  }, [axes2, angleStep, cx, cy, radius])

  return (
    <svg width={size} height={size}>
      {/* webs */}
      {webs.map((ring, idx) => (
        <polygon key={idx} points={ring.map(p => p.join(',')).join(' ')} fill="none" stroke="#e0e0e0" />
      ))}
      {/* axes lines and labels */}
      {axes.map((ax, i) => {
        const a = i * angleStep - Math.PI / 2
        const x = cx + radius * Math.cos(a)
        const y = cy + radius * Math.sin(a)
        const lx = cx + (radius + 12) * Math.cos(a)
        const ly = cy + (radius + 12) * Math.sin(a)
        return (
          <g key={ax.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#eeeeee" />
            <text x={lx} y={ly} fontSize="10" textAnchor="middle" dominantBaseline="middle">{ax.label}</text>
          </g>
        )
      })}
      {/* value polygons */}
      {poly2 && <polygon points={poly2.map(p => p.join(',')).join(' ')} fill={stroke2} opacity={0.2} stroke={color2} strokeWidth={2} />}
      <polygon points={poly.map(p => p.join(',')).join(' ')} fill={stroke} opacity={0.3} stroke={color} strokeWidth={2} />
    </svg>
  )
}