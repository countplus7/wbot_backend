const express = require('express');
const router = express.Router();
const salesforceService = require('../services/salesforce');

// OAuth Integration
router.get('/auth/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const authUrl = salesforceService.getAuthUrl(parseInt(businessId));
    
    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    console.error('Error getting Salesforce auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Salesforce auth URL'
    });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth error:', error);
      return res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Salesforce Authentication Error</title>
  </head>
  <body>
    <script>
      // Notify parent window of error
      if (window.opener) {
        window.opener.postMessage({ type: 'SALESFORCE_AUTH_ERROR' }, '*');
      }
      // Close the popup window
      window.close();
    </script>
    <p>Authentication error! This window will close automatically.</p>
  </body>
  </html>
`);
    }

    if (!code || !state) {
      return res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Salesforce Authentication Error</title>
  </head>
  <body>
    <script>
      // Notify parent window of error
      if (window.opener) {
        window.opener.postMessage({ type: 'SALESFORCE_AUTH_ERROR' }, '*');
      }
      // Close the popup window
      window.close();
    </script>
    <p>Missing parameters! This window will close automatically.</p>
  </body>
  </html>
`);
    }

    const { businessId } = JSON.parse(state);

    if (!businessId) {
      return res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Salesforce Authentication Error</title>
  </head>
  <body>
    <script>
      // Notify parent window of error
      if (window.opener) {
        window.opener.postMessage({ type: 'SALESFORCE_AUTH_ERROR' }, '*');
      }
      // Close the popup window
      window.close();
    </script>
    <p>Invalid state! This window will close automatically.</p>
  </body>
  </html>
`);
    }

    const result = await salesforceService.exchangeCodeForTokens(code, businessId);

    if (result.success) {
      res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Salesforce Authentication Success</title>
  </head>
  <body>
    <script>
      // Notify parent window of success
      if (window.opener) {
        window.opener.postMessage({ 
          type: 'SALESFORCE_AUTH_SUCCESS', 
          email: '\',
          username: '\',
          instance_url: '\'
        }, '*');
      }
      // Close the popup window
      window.close();
    </script>
    <p>Authentication successful! This window will close automatically.</p>
  </body>
  </html>
`);
    } else {
      res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Salesforce Authentication Failed</title>
  </head>
  <body>
    <script>
      // Notify parent window of error
      if (window.opener) {
        window.opener.postMessage({ type: 'SALESFORCE_AUTH_ERROR' }, '*');
      }
      // Close the popup window
      window.close();
    </script>
    <p>Authentication failed! This window will close automatically.</p>
  </body>
  </html>
`);
    }
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Salesforce Authentication Error</title>
  </head>
  <body>
    <script>
      // Notify parent window of error
      if (window.opener) {
        window.opener.postMessage({ type: 'SALESFORCE_AUTH_ERROR' }, '*');
      }
      // Close the popup window
      window.close();
    </script>
    <p>Authentication failed! This window will close automatically.</p>
  </body>
  </html>
`);
  }
});

// Configuration Management
router.get('/config/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const config = await salesforceService.getIntegration(parseInt(businessId));
    
    if (config) {
      res.json({
        success: true,
        isIntegrated: true,
        email: config.email,
        username: config.username,
        instance_url: config.instance_url,
        lastUpdated: config.updated_at
      });
    } else {
      res.json({
        success: true,
        isIntegrated: false
      });
    }
  } catch (error) {
    console.error('Error getting Salesforce config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Salesforce configuration'
    });
  }
});

router.delete('/config/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    await salesforceService.removeIntegration(parseInt(businessId));
    
    res.json({
      success: true,
      message: 'Salesforce integration removed successfully'
    });
  } catch (error) {
    console.error('Error removing Salesforce config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove Salesforce configuration'
    });
  }
});

module.exports = router;
