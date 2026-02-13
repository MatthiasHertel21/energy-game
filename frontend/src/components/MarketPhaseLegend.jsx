import React from 'react'

/**
 * MarketPhaseLegend
 * Displays glossary of market phase terms
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
      <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px', color: '#333' }}>
        Glossary
      </div>
      <div style={{ marginBottom: '10px', fontSize: '10px', color: '#666', fontStyle: 'italic' }}>
        Market Phases: Settled (gray) → Intraday (orange) → Day-Ahead (blue) → Forecast (purple)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 16px' }}>
        <div><strong>Past:</strong> Energy delivered, cannot be changed</div>
        <div><strong>Committed DA:</strong> Day-Ahead obligation accepted</div>
        <div><strong>ID Closed:</strong> Intraday gate closed for these hours</div>
        <div><strong>ID Open:</strong> Intraday trading still possible</div>
        <div><strong>DA Open:</strong> Day-Ahead bidding open for next day</div>
        <div><strong>Forecast:</strong> Forward planning (always editable)</div>
        <div><strong>NOW:</strong> Current simulation time</div>
        <div><strong>ID Gate:</strong> Intraday gate (6h before delivery)</div>
        <div><strong>ID+/ID−:</strong> Intraday Buy / Sell adjustments</div>
        <div><strong>Max Power:</strong> Maximum device capacity</div>
        <div><strong>CF:</strong> Capacity Factor baseline</div>
        <div><strong>Min Load/DR Min:</strong> Operational constraints</div>
      </div>
    </div>
  )
}
