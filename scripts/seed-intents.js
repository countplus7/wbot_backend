const pool = require("../config/database");

// Performance monitoring
const startTime = Date.now();
let intentsCreated = 0;
let examplesCreated = 0;

// Enhanced error handling
const executeWithRetry = async (query, params = [], retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(query, params);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`🔄 Retry ${i + 1}/${retries} for query...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Sample intents with examples
const sampleIntents = [
  {
    name: "greeting",
    description: "User greetings and salutations",
    confidence_threshold: 0.8,
    examples: [
      "Hello",
      "Hi there",
      "Good morning",
      "Good afternoon",
      "Good evening",
      "Hey",
      "Hi",
      "Hello there",
      "Greetings",
      "How are you?",
    ],
  },
  {
    name: "goodbye",
    description: "User farewells and goodbyes",
    confidence_threshold: 0.8,
    examples: [
      "Goodbye",
      "Bye",
      "See you later",
      "Take care",
      "Farewell",
      "See you soon",
      "Bye bye",
      "Have a good day",
      "Talk to you later",
      "Catch you later",
    ],
  },
  {
    name: "question",
    description: "User asking questions",
    confidence_threshold: 0.7,
    examples: [
      "What is this?",
      "How does it work?",
      "Can you help me?",
      "What are your hours?",
      "Where are you located?",
      "How much does it cost?",
      "What services do you offer?",
      "Can I get more information?",
      "What do you recommend?",
      "Is this available?",
    ],
  },
  {
    name: "complaint",
    description: "User complaints and issues",
    confidence_threshold: 0.8,
    examples: [
      "This is not working",
      "I'm not satisfied",
      "There's a problem",
      "This is broken",
      "I'm disappointed",
      "This doesn't meet my expectations",
      "I want a refund",
      "This is unacceptable",
      "I'm frustrated",
      "This is terrible",
    ],
  },
  {
    name: "compliment",
    description: "User compliments and praise",
    confidence_threshold: 0.8,
    examples: [
      "Great job",
      "Excellent service",
      "I'm very happy",
      "This is amazing",
      "Thank you so much",
      "You're the best",
      "I love this",
      "Perfect",
      "Outstanding",
      "Fantastic work",
    ],
  },
  {
    name: "appointment",
    description: "User requesting appointments or scheduling",
    confidence_threshold: 0.7,
    examples: [
      "I'd like to schedule an appointment",
      "Can I book a meeting?",
      "When are you available?",
      "I need to make an appointment",
      "Can we set up a time?",
      "I want to schedule something",
      "What times do you have?",
      "Can I reserve a slot?",
      "I need to book",
      "When can we meet?",
    ],
  },
  {
    name: "information_request",
    description: "User requesting specific information",
    confidence_threshold: 0.7,
    examples: [
      "Tell me more about",
      "I need information about",
      "Can you explain",
      "What do you know about",
      "I want to learn about",
      "Can you provide details",
      "I need to know",
      "What can you tell me",
      "I'm looking for information",
      "Can you help me understand",
    ],
  },
  {
    name: "confirmation",
    description: "User confirming or agreeing",
    confidence_threshold: 0.8,
    examples: [
      "Yes",
      "That's correct",
      "I agree",
      "Confirmed",
      "Exactly",
      "Right",
      "That's right",
      "I confirm",
      "Yes, please",
      "That works for me",
    ],
  },
  {
    name: "cancellation",
    description: "User canceling or declining",
    confidence_threshold: 0.8,
    examples: [
      "No",
      "Cancel",
      "I don't want to",
      "Not interested",
      "I decline",
      "I can't",
      "I won't",
      "I refuse",
      "I'm not interested",
      "I don't need this",
    ],
  },
  {
    name: "help_request",
    description: "User asking for help or assistance",
    confidence_threshold: 0.7,
    examples: [
      "I need help",
      "Can you assist me?",
      "I'm having trouble",
      "I don't understand",
      "Can you guide me?",
      "I need support",
      "Help me please",
      "I'm stuck",
      "I need assistance",
      "Can you help?",
    ],
  },
  {
    name: "faq",
    description: "User asking frequently asked questions",
    confidence_threshold: 0.7,
    examples: [
      "What are your business hours?",
      "How do I return a product?",
      "What payment methods do you accept?",
      "Do you offer delivery?",
      "What is your refund policy?",
      "How can I contact support?",
      "What are your shipping options?",
    ],
  },
  {
    name: "gmail_send",
    description: "User wants to send an email via Gmail",
    confidence_threshold: 0.8,
    examples: [
      "Send an email to john@example.com",
      "Email the client about the project",
      "Send a message to the team",
      "Email the invoice to the customer",
      "Send an email",
      "I need to email someone",
      "Can you send an email?",
      "Email this to my boss",
      "Send a message via email",
      "I want to send an email",
      "Email the report to the manager",
      "Send an email to support",
      "Email the proposal to the client",
      "Can you email this information?",
      "Send an email with the details",
    ],
  },
  {
    name: "calendar_create",
    description: "User wants to create a calendar event or appointment",
    confidence_threshold: 0.8,
    examples: [
      "Schedule a meeting for tomorrow",
      "Book an appointment next week",
      "Create a calendar event",
      "Add an event to my calendar",
      "Schedule a call",
      "Book a meeting",
      "Create an appointment",
      "Add a meeting to my calendar",
      "Schedule something for next Monday",
      "Book a time slot",
      "Create a calendar entry",
      "Schedule a conference call",
      "Book an appointment for Friday",
      "Add a reminder to my calendar",
      "Schedule a team meeting",
    ],
  },
  {
    name: "calendar_check",
    description: "User wants to check calendar availability or events",
    confidence_threshold: 0.8,
    examples: [
      "Check my availability",
      "What meetings do I have today?",
      "Show me my calendar",
      "What's on my schedule?",
      "Check my calendar",
      "What appointments do I have?",
      "Show me my schedule",
      "What's my availability?",
      "Check my upcoming meetings",
      "What's on my calendar today?",
      "Show me my appointments",
      "Check my schedule for tomorrow",
      "What meetings are scheduled?",
      "Show me my calendar events",
      "What's my schedule like?",
    ],
  },
  {
    name: "calendar_update",
    description: "User wants to update or modify calendar events",
    confidence_threshold: 0.8,
    examples: [
      "Reschedule my meeting",
      "Change my appointment time",
      "Update my calendar event",
      "Move my meeting to tomorrow",
      "Reschedule the call",
      "Change the meeting time",
      "Update my appointment",
      "Move my appointment",
      "Reschedule for next week",
      "Change my calendar event",
      "Update the meeting time",
      "Move the meeting",
      "Reschedule my appointment",
      "Change the appointment",
      "Update my schedule",
    ],
  },
  {
    name: "calendar_delete",
    description: "User wants to delete or cancel calendar events",
    confidence_threshold: 0.8,
    examples: [
      "Cancel my meeting",
      "Delete my appointment",
      "Remove my calendar event",
      "Cancel the meeting",
      "Delete my appointment",
      "Remove the event",
      "Cancel my calendar event",
      "Delete the meeting",
      "Remove my meeting",
      "Cancel the appointment",
      "Delete my calendar entry",
      "Remove the appointment",
      "Cancel my scheduled meeting",
      "Delete the calendar event",
      "Remove my scheduled event",
    ],
  },
];

// Seed intents and examples
const seedIntents = async () => {
  try {
    console.log(" Starting intent seeding...");
    const seedStartTime = Date.now();

    // Clear existing intents and examples
    console.log("🧹 Clearing existing intents and examples...");
    await executeWithRetry("DELETE FROM intent_examples");
    await executeWithRetry("DELETE FROM intent_cache");
    await executeWithRetry("DELETE FROM intents");
    console.log("✅ Cleared existing intent data");

    // Insert intents and examples
    for (const intent of sampleIntents) {
      console.log(`📝 Creating intent: ${intent.name}`);

      // Insert intent
      const intentResult = await executeWithRetry(
        `
        INSERT INTO intents (name, description, confidence_threshold, active)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [intent.name, intent.description, intent.confidence_threshold, true]
      );

      const intentId = intentResult.rows[0].id;
      intentsCreated++;

      // Insert examples for this intent
      for (const exampleText of intent.examples) {
        await executeWithRetry(
          `
          INSERT INTO intent_examples (intent_id, text, weight, active)
          VALUES ($1, $2, $3, $4)
        `,
          [intentId, exampleText, 1.0, true]
        );
        examplesCreated++;
      }

      console.log(`✅ Created ${intent.examples.length} examples for ${intent.name}`);
    }

    const seedTime = Date.now() - seedStartTime;

    console.log("\n🎉 Intent seeding completed successfully!");
    console.log(`📊 Seeding Summary:`);
    console.log(`   • Intents created: ${intentsCreated}`);
    console.log(`   • Examples created: ${examplesCreated}`);
    console.log(`   • Total time: ${seedTime}ms`);
    console.log(`   • Average per intent: ${Math.round(seedTime / intentsCreated)}ms`);
  } catch (error) {
    console.error("❌ Error seeding intents:", error);
    throw error;
  }
};

// Main seeding function
const runSeeding = async () => {
  try {
    await seedIntents();
    console.log("✅ Intent seeding completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Intent seeding failed:", error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runSeeding();
}

module.exports = { seedIntents };
