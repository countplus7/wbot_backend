const express = require('express');
const router = express.Router();
const HubSpotService = require('../services/hubspot');

// OAuth Integration
router.get('/auth/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    
    const authUrl = HubSpotService.getAuthUrl(parseInt(businessId));
    
    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    console.error('Error getting HubSpot auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get HubSpot auth URL'
    });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state'
      });
    }

    const { businessId } = JSON.parse(state);
    
    const result = await HubSpotService.exchangeCodeForTokens(code, businessId);

    res.json({
      success: true,
      message: 'HubSpot integration successful',
      data: result
    });
  } catch (error) {
    console.error('Error in HubSpot OAuth callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete HubSpot authentication'
    });
  }
});

// Configuration Management
router.get('/config/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const integration = await HubSpotService.getIntegration(parseInt(businessId));
    
    if (!integration) {
      return res.json({
        success: true,
        isIntegrated: false,
        message: 'No HubSpot integration found'
      });
    }

    res.json({
      success: true,
      isIntegrated: true,
      email: integration.email || 'Unknown',
      user_id: integration.user_id || 'Unknown',
      lastUpdated: integration.updated_at
    });
  } catch (error) {
    console.error('Error getting HubSpot config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get HubSpot configuration'
    });
  }
});

router.delete('/config/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    await HubSpotService.deleteIntegration(parseInt(businessId));
    
    res.json({
      success: true,
      message: 'HubSpot integration removed successfully'
    });
  } catch (error) {
    console.error('Error deleting HubSpot config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove HubSpot integration'
    });
  }
});

// CRM Operations
router.post('/contacts/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const contactData = req.body;
    
    const result = await HubSpotService.createContact(parseInt(businessId), contactData);
    
    res.json({
      success: true,
      message: 'Contact created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating HubSpot contact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create contact in HubSpot'
    });
  }
});

router.post('/companies/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const companyData = req.body;
    
    const result = await HubSpotService.createCompany(parseInt(businessId), companyData);
    
    res.json({
      success: true,
      message: 'Company created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating HubSpot company:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create company in HubSpot'
    });
  }
});

router.post('/deals/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const dealData = req.body;
    
    const result = await HubSpotService.createDeal(parseInt(businessId), dealData);
    
    res.json({
      success: true,
      message: 'Deal created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating HubSpot deal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create deal in HubSpot'
    });
  }
});

router.post('/contacts/search/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { searchTerm } = req.body;
    
    const result = await HubSpotService.searchContacts(parseInt(businessId), searchTerm);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error searching HubSpot contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search contacts in HubSpot'
    });
  }
});

module.exports = router;