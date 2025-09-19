const IntentDetectionService = require('../services/intent-detection');

const intentExamples = [
  // Email intents
  { intent: 'GOOGLE_EMAIL', text: 'Send email to john@company.com about the meeting', weight: 1.0 },
  { intent: 'GOOGLE_EMAIL', text: 'Email the client about project status', weight: 1.0 },
  { intent: 'GOOGLE_EMAIL', text: 'Send a message to team@company.com', weight: 1.0 },
  { intent: 'GOOGLE_EMAIL', text: 'Email the invoice to customer', weight: 1.0 },
  { intent: 'GOOGLE_EMAIL', text: 'Forward this to manager@company.com', weight: 1.0 },

  // Calendar intents
  { intent: 'GOOGLE_CALENDAR', text: 'Schedule a meeting tomorrow at 2pm', weight: 1.0 },
  { intent: 'GOOGLE_CALENDAR', text: 'Book an appointment next week', weight: 1.0 },
  { intent: 'GOOGLE_CALENDAR', text: 'Check my availability for Friday', weight: 1.0 },
  { intent: 'GOOGLE_CALENDAR', text: 'Create a calendar event for team meeting', weight: 1.0 },
  { intent: 'GOOGLE_CALENDAR', text: 'What meetings do I have today?', weight: 1.0 },
  { intent: 'GOOGLE_CALENDAR', text: 'Cancel my 3pm appointment', weight: 1.0 },

  // HubSpot intents
  { intent: 'HUBSPOT', text: 'Create a new contact for Sarah Johnson', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'Add a company called TechCorp to HubSpot', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'Create a new deal worth $5000', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'Search for contacts in New York', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'Update contact information for John', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'Check deal status for ABC project', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'Create a new lead from website', weight: 1.0 },
  { intent: 'HUBSPOT', text: 'View my sales pipeline', weight: 1.0 },

  // Odoo intents
  { intent: 'ODOO', text: 'Create a new order for customer XYZ', weight: 1.0 },
  { intent: 'ODOO', text: 'Generate an invoice for order #123', weight: 1.0 },
  { intent: 'ODOO', text: 'Check inventory levels for product ABC', weight: 1.0 },
  { intent: 'ODOO', text: 'Update product information for SKU-456', weight: 1.0 },
  { intent: 'ODOO', text: 'Process a return for order #789', weight: 1.0 },
  { intent: 'ODOO', text: 'Check stock availability', weight: 1.0 },
  { intent: 'ODOO', text: 'Create purchase order', weight: 1.0 },

  // FAQ intents
  { intent: 'FAQ', text: 'What are your business hours?', weight: 1.0 },
  { intent: 'FAQ', text: 'How do I return a product?', weight: 1.0 },
  { intent: 'FAQ', text: 'What payment methods do you accept?', weight: 1.0 },
  { intent: 'FAQ', text: 'Do you offer delivery?', weight: 1.0 },
  { intent: 'FAQ', text: 'What is your refund policy?', weight: 1.0 },
  { intent: 'FAQ', text: 'How can I contact support?', weight: 1.0 },
  { intent: 'FAQ', text: 'What are your shipping options?', weight: 1.0 },
  { intent: 'FAQ', text: 'Do you have a warranty?', weight: 1.0 },

  // General intents
  { intent: 'GENERAL', text: 'Hello, how are you?', weight: 1.0 },
  { intent: 'GENERAL', text: 'Thank you for your help', weight: 1.0 },
  { intent: 'GENERAL', text: 'I have a question', weight: 1.0 },
  { intent: 'GENERAL', text: 'Can you help me?', weight: 1.0 },
  { intent: 'GENERAL', text: 'Good morning', weight: 1.0 },
  { intent: 'GENERAL', text: 'Have a great day', weight: 1.0 },
];

const seedIntents = async () => {
  try {
    console.log('Seeding intent examples...');
    
    const results = await IntentDetectionService.bulkAddIntentExamples(intentExamples);
    const successCount = results.filter(r => r).length;
    
    console.log(`✅ Seeded ${successCount}/${intentExamples.length} intent examples`);
    console.log('Intent seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding intents:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  seedIntents();
}

module.exports = { seedIntents };