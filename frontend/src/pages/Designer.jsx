import React, { useState } from 'react'
import { Box, Container, Tabs, Tab, Typography, Toolbar, Button } from '@mui/material'
import { Collections as CampaignsIcon, List as ScenariosIcon, Add as AddIcon } from '@mui/icons-material'
import DesignerCampaignsTab from '../components/DesignerCampaignsTab'
import DesignerScenariosTab from '../components/DesignerScenariosTab'
import DocsFab from '../components/DocsFab'
import { useNavigate } from 'react-router-dom'

export default function Designer() {
  const [activeTab, setActiveTab] = useState(0)
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Designer
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />}
            onClick={() => setCreateCampaignOpen(true)}
          >
            Add Campaign
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />}
            onClick={() => navigate('/kse')}
          >
            Add Scenario
          </Button>
        </Box>
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
        {activeTab === 0 && <DesignerCampaignsTab createOpen={createCampaignOpen} setCreateOpen={setCreateCampaignOpen} />}
      </Box>

      <Box role="tabpanel" hidden={activeTab !== 1} id="tabpanel-scenarios" aria-labelledby="tab-scenarios">
        {activeTab === 1 && <DesignerScenariosTab />}
      </Box>

      <DocsFab href="/docs/designer" label="Open Designer Handbook" />
    </Container>
  )
}
