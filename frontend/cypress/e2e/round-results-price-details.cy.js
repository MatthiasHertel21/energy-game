/// <reference types="cypress" />

import React from 'react'
import { createRoot } from 'react-dom/client'
import RoundResultsScreenSimple from '../../src/components/RoundResultsScreenSimple'

describe('Round results price and profit details', () => {
  const sessionId = 370
  const deviceId = 'device_gt_1'
  const playerTypeId = 'ptype_gt'

  const scenario = {
    name: 'Regression Scenario',
    campaign_name: 'Regression Campaign',
    config: {
      general: {
        round_span_hours: 6,
        forecast_horizon_hours: 24,
        horizon_hours: 24,
        freeze_hours: 6,
        rounds: 4,
        start_time: '00:00',
      },
      market: {},
      markets: {
        dam: { trading: ['on', 'on', 'on', 'on'] },
        idm: { trading: ['off', 'on', 'on', 'on'] },
      },
      player_input: { mode: 'all_hours', editable_offsets: [], hide_non_editable_hours: false, allow_other_rounds_editing: true },
      devices: [
        {
          id: deviceId,
          name: 'Gas Turbine 1',
          type: 'gas_turbine',
          capacity_mw: 20,
          variable_cost_zar_per_mwh: 50,
          fixed_cost_zar_per_hour: 20,
        },
      ],
      player_types: [
        {
          id: playerTypeId,
          name: 'Gas Producer',
          description: 'Producer for regression test',
          devices: [deviceId],
        },
      ],
      challenges: [],
      events: [],
    },
  }

  const roundOneResult = {
    round: 1,
    ranking: [],
    active_events: [],
    my_result: {
      player_id: 7,
      email: 'player7@example.com',
      player_role: 'producer',
      type: playerTypeId,
      kpis: {
        revenue_zar: 600,
        profit_zar: 380,
        variable_cost_zar: 150,
        fixed_cost_zar: 20,
        imbalance_cost_zar: 30,
        battery_charge_cost_zar: 0,
        atc_dispatch_cost_zar: 10,
        congestion_revenue_zar: 0,
        co2_emissions_kg: 12,
        dispatched_mwh: 6,
        planned_mwh: 6,
        actual_mwh: 6,
        hourly_breakdown: [
          {
            hour: 0,
            smp: 100,
            dispatched_mw: 6,
            revenue_zar: 600,
            variable_cost_zar: 150,
            fixed_cost_zar: 20,
            imbalance_cost_zar: 30,
            battery_charge_cost_zar: 0,
            network_shortfall_cost_zar: 10,
            congestion_revenue_zar: 0,
            profit_zar: 380,
          },
        ],
        device_hourly_breakdown: {
          [deviceId]: [
            {
              hour: 0,
              hour_idx: 0,
              planned_mw: 6,
              actual_mw: 6,
              dispatched_mw: 6,
              total_dispatched_mwh: 6,
              da_dispatched_mwh: 6,
              id_dispatched_mwh: 0,
              revenue_zar: 600,
              da_revenue_zar: 600,
              id_revenue_zar: 0,
              variable_cost_zar: 150,
              fixed_cost_zar: 20,
              imbalance_mwh: 0,
              imbalance_cost_zar: 30,
              battery_charge_cost_zar: 0,
              congestion_revenue_zar: 0,
              network_shortfall_cost_zar: 10,
              profit_zar: 380,
              co2_kg: 12,
              da_price_zar: 100,
            },
          ],
        },
      },
      hourly_results: [
        { hour_idx: 0, hour_offset: 0, smp: 100, volume: 6, id_trade_count: 0 },
      ],
      dam_bid_dispatch: {
        [deviceId]: {
          A: [
            { hour_idx: 0, hour_offset: 0, mw_offered: 6, mw_dispatched: 6, acceptance_ratio: 1, smp: 100, price_bid: 90 },
          ],
        },
      },
      bid_dispatch: {},
    },
  }

  const roundTwoResult = {
    round: 2,
    ranking: [],
    active_events: [],
    my_result: {
      player_id: 7,
      email: 'player7@example.com',
      player_role: 'producer',
      type: playerTypeId,
      idp: 828.5,
      smp: 828.5,
      id_trade_count: 0,
      kpis: {
        revenue_zar: 800,
        profit_zar: 460,
        variable_cost_zar: 250,
        fixed_cost_zar: 20,
        imbalance_cost_zar: 40,
        battery_charge_cost_zar: 0,
        atc_dispatch_cost_zar: 30,
        congestion_revenue_zar: 0,
        co2_emissions_kg: 15,
        dispatched_mwh: 8,
        planned_mwh: 8,
        actual_mwh: 8,
        hourly_breakdown: [
          {
            hour: 6,
            hour_idx: 6,
            smp: 828.5,
            idp: 828.5,
            dispatched_mw: 8,
            revenue_zar: 800,
            variable_cost_zar: 250,
            fixed_cost_zar: 20,
            imbalance_cost_zar: 40,
            battery_charge_cost_zar: 0,
            network_shortfall_cost_zar: 30,
            congestion_revenue_zar: 0,
            profit_zar: 460,
          },
        ],
        device_hourly_breakdown: {
          [deviceId]: [
            {
              hour: 6,
              hour_idx: 6,
              planned_mw: 8,
              actual_mw: 8,
              dispatched_mw: 8,
              total_dispatched_mwh: 8,
              da_dispatched_mwh: 8,
              id_dispatched_mwh: 0,
              revenue_zar: 800,
              da_revenue_zar: 800,
              id_revenue_zar: 0,
              variable_cost_zar: 250,
              fixed_cost_zar: 20,
              imbalance_mwh: 0,
              imbalance_cost_zar: 40,
              battery_charge_cost_zar: 0,
              congestion_revenue_zar: 0,
              network_shortfall_cost_zar: 30,
              profit_zar: 460,
              co2_kg: 15,
              da_price_zar: 100,
            },
          ],
        },
      },
      hourly_results: [
        { hour_idx: 6, hour_offset: 0, smp: 828.5, idp: 828.5, volume: 8, id_trade_count: 0 },
      ],
      dam_bid_dispatch: {
        [deviceId]: {
          A: [
            { hour_idx: 6, hour_offset: 0, mw_offered: 8, mw_dispatched: 8, acceptance_ratio: 1, smp: 828.5, price_bid: 90 },
          ],
        },
      },
      bid_dispatch: {},
    },
  }

  const mountRoundResults = (initialBreakdownKey = null) => {
    cy.intercept('GET', new RegExp(`/api/sessions/${sessionId}/round-results/1$`), roundOneResult).as('roundOne')
    cy.intercept('GET', new RegExp(`/api/sessions/${sessionId}/round-results/2$`), roundTwoResult).as('roundTwo')

    cy.visit('/test-mount.html')

    cy.window().then((win) => {
      const mountNode = win.document.getElementById('root')
      const root = createRoot(mountNode)
      root.render(
        <RoundResultsScreenSimple
          sessionId={sessionId}
          round={2}
          mode="isolated_per_player"
          scenario={scenario}
          campaignName={scenario.campaign_name}
          initialBreakdownKey={initialBreakdownKey}
        />
      )
    })

    cy.wait('@roundTwo')
    cy.wait('@roundOne')
    cy.wait('@roundTwo')
  }

  it('shows current round price without player intraday trades', () => {
    mountRoundResults()

    cy.contains('Round 2 Results', { timeout: 10000 }).should('be.visible')
    cy.contains('Gas Turbine 1').should('be.visible')
    cy.contains('Current Price / SMP (ZAR/MWh)').closest('tr').should('contain.text', '828.5')
  })

  it('shows hourly profit inputs in the profit breakdown dialog', () => {
    mountRoundResults('profit')

    cy.contains('Profit breakdown', { timeout: 10000 }).should('be.visible')
    cy.contains('Profit = Revenue (ZAR 800) - Variable Cost (ZAR 250) - Fixed Cost (ZAR 20) - Imbalance Cost (ZAR 40) - Battery Charge Cost (ZAR 0) - Redispatch Cost (ZAR 30) + Congestion Revenue (ZAR 0)').should('be.visible')
    cy.contains('Hourly Formula Inputs').should('be.visible')
    cy.contains('Formula input').should('be.visible')
    cy.contains('Current Price / SMP (ZAR/MWh)').closest('tr').should('contain.text', '828.5')
    cy.contains('Variable Cost (ZAR)').closest('tr').should('contain.text', 'ZAR 250')
    cy.contains('Profit (ZAR)').closest('tr').should('contain.text', 'ZAR 460')
  })
})