import React from 'react'
import { Tooltip } from '@mui/material'

const termDefinitions = {
  'DA': 'Day-Ahead Market: Trading happens one day before delivery',
  'ID': 'Intraday Market: Trading happens on the same day for adjustments',
  'IDM': 'Intraday Market: Trading happens on the same day for adjustments',
  'SMP': 'System Marginal Price: The price at which supply equals demand',
  'Balancing': 'Balancing costs occur when actual delivery differs from contracted position',
  'Imbalance': 'The difference between your contracted position and actual delivery',
  'Dispatch': 'The actual amount of electricity allocated to your generation unit',
  'Bid': 'Your price offer to sell electricity in the market',
  'Offer': 'Your price offer to buy or sell electricity in the market',
  'ZAR': 'South African Rand: The currency used in this market',
  'MWh': 'Megawatt-hour: Unit of energy (1 MWh = 1000 kWh)',
  'MW': 'Megawatt: Unit of power',
}

/**
 * TermTooltip wraps text with a tooltip explaining the term
 * @param {string} term - The term to explain
 * @param {React.ReactNode} children - The content to display
 * @param {object} props - Additional props for Tooltip
 */
export default function TermTooltip({ term, children, ...props }) {
  const definition = termDefinitions[term]
  
  if (!definition) {
    // If term not found in definitions, return children without tooltip
    return <>{children}</>
  }

  return (
    <Tooltip 
      title={definition} 
      arrow 
      placement="top"
      enterDelay={300}
      enterTouchDelay={300}
      {...props}
    >
      <span style={{ 
        borderBottom: '1px dotted currentColor', 
        cursor: 'help',
        display: 'inline-block'
      }}>
        {children}
      </span>
    </Tooltip>
  )
}
