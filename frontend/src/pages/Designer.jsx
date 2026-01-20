import React, { useState } from 'react'
import { Box, Container, Tabs, Tab, Typography } from '@mui/material'
import { Collections as CampaignsIcon, List as ScenariosIcon } from '@mui/icons-material'
import DesignerCampaignsTab from '../components/DesignerCampaignsTab'
import DesignerScenariosTab from '../components/DesignerScenariosTab'
import DocsFab from '../components/DocsFab'

export default function Designer() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Designer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage campaigns and scenarios for the Knowledge Scenario Editor (KSE)
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab 
            icon={<CampaignsIcon />} 
            iconPosition="start" 
            label="Campaigns" 
            id="tab-campaigns"
            aria-controls="tabpanel-campaigns"
          />
          <Tab 
            icon={<ScenariosIcon />} 
            iconPosition="start" 
            label="Scenarios" 
            id="tab-scenarios"
            aria-controls="tabpanel-scenarios"
          />
        </Tabs>
      </Box>

      <Box role="tabpanel" hidden={activeTab !== 0} id="tabpanel-campaigns" aria-labelledby="tab-campaigns">
        {activeTab === 0 && <DesignerCampaignsTab />}
      </Box>

      <Box role="tabpanel" hidden={activeTab !== 1} id="tabpanel-scenarios" aria-labelledby="tab-scenarios">
        {activeTab === 1 && <DesignerScenariosTab />}
      </Box>

      <DocsFab href="/docs/designer" label="Open Designer Handbook" />
    </Container>
  )
}
