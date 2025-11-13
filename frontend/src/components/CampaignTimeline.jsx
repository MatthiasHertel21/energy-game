import React, { useRef, useEffect } from 'react'
import { Box, Typography } from '@mui/material'

/**
 * CampaignTimeline - Visual timeline of campaign scenarios with progress bubbles
 * 
 * Props:
 * - scenarios: Array of {scenario_id, name, order_index, status}
 * - onScenarioClick: Callback when bubble is clicked (receives scenario_id)
 */
export default function CampaignTimeline({ scenarios = [], onScenarioClick }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  
  // Sort scenarios by order_index
  const sortedScenarios = [...scenarios].sort((a, b) => a.order_index - b.order_index)
  
  // Config
  const bubbleRadius = 20
  const spacing = 100
  const padding = 40
  const lineY = 60
  
  // Calculate SVG width
  const svgWidth = Math.max(600, sortedScenarios.length * spacing + padding * 2)
  const svgHeight = 120
  
  // Color mapping
  const getColor = (status) => {
    switch (status) {
      case 'completed': return '#4caf50' // Green
      case 'in_progress': return '#ff9800' // Orange
      default: return '#9e9e9e' // Gray (not_started)
    }
  }
  
  // Get status label
  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return 'Completed'
      case 'in_progress': return 'In Progress'
      default: return 'Not Started'
    }
  }
  
  const handleKeyDown = (e, scenario) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (onScenarioClick) {
        onScenarioClick(scenario.scenario_id)
      }
    }
  }
  
  if (sortedScenarios.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No scenarios in this campaign
        </Typography>
      </Box>
    )
  }
  
  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        overflowX: 'auto', 
        overflowY: 'hidden',
        py: 2,
        mb: 2
      }}
      role="region"
      aria-label={`Campaign timeline with ${sortedScenarios.length} scenarios`}
    >
      <svg 
        ref={svgRef}
        width={svgWidth} 
        height={svgHeight}
        style={{ display: 'block' }}
      >
        {/* Connecting line */}
        {sortedScenarios.length > 1 && (
          <line
            x1={padding}
            y1={lineY}
            x2={svgWidth - padding}
            y2={lineY}
            stroke="#e0e0e0"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
        )}
        
        {/* Scenario bubbles */}
        {sortedScenarios.map((scenario, index) => {
          const x = padding + index * spacing
          const y = lineY
          const color = getColor(scenario.status)
          const statusLabel = getStatusLabel(scenario.status)
          
          return (
            <g 
              key={scenario.scenario_id}
              style={{ cursor: onScenarioClick ? 'pointer' : 'default' }}
              onClick={() => onScenarioClick && onScenarioClick(scenario.scenario_id)}
              onKeyDown={(e) => handleKeyDown(e, scenario)}
              tabIndex={0}
              role="button"
              aria-label={`Scenario ${index + 1}: ${scenario.name}, ${statusLabel}`}
            >
              {/* Bubble circle */}
              <circle
                cx={x}
                cy={y}
                r={bubbleRadius}
                fill={color}
                stroke="#fff"
                strokeWidth="2"
                style={{ transition: 'transform 0.2s' }}
                className="timeline-bubble"
              />
              
              {/* Scenario number */}
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="14"
                fontWeight="bold"
              >
                #{index + 1}
              </text>
              
              {/* Scenario name (below bubble) */}
              <text
                x={x}
                y={y + bubbleRadius + 15}
                textAnchor="middle"
                fill="#666"
                fontSize="12"
                style={{ maxWidth: spacing - 10 }}
              >
                {scenario.name.length > 15 ? scenario.name.substring(0, 12) + '...' : scenario.name}
              </text>
              
              {/* Hover title (tooltip) */}
              <title>{`${scenario.name} - ${statusLabel}`}</title>
            </g>
          )
        })}
      </svg>
      
      {/* CSS for hover effect */}
      <style>{`
        .timeline-bubble:hover {
          transform: scale(1.1);
          filter: brightness(1.1);
        }
        g[role="button"]:focus {
          outline: 2px solid #1976d2;
          outline-offset: 4px;
        }
      `}</style>
    </Box>
  )
}
