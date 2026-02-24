import React from 'react'

/**
 * MarketPhaseLegend
 * Displays abbreviations used in player screen
 */
export default function MarketPhaseLegend() {
  return (
    <div style={{ 
      backgroundColor: '#f5f5f5', 
      padding: '12px 16px', 
      borderRadius: '4px',
      fontSize: '11px',
      lineHeight: '1.6',
      color: '#555',
      marginTop: '12px'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px', color: '#333' }}>Abbreviations</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 16px' }}>
        <div><strong>DAM:</strong> Day-Ahead Market</div>
        <div><strong>IDM:</strong> Intraday Market</div>
        <div><strong>SMP:</strong> System Marginal Price</div>
        <div><strong>MW:</strong> Megawatt (power)</div>
        <div><strong>MWh:</strong> Megawatt-hour (energy)</div>
        <div><strong>ZAR:</strong> South African Rand</div>
      </div>
    </div>
  )
}
