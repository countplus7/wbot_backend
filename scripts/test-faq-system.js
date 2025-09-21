const pool = require("../config/database");
const AirtableService = require("../services/airtable");

async function testFAQSystem() {
  try {
    console.log("�� Testing FAQ system for business ID 1...\n");

    // Test 1: Check Airtable configuration
    const config = await AirtableService.getConfig(1);
    if (!config) {
      console.log("❌ No Airtable configuration found for business ID 1");
      console.log("📝 Please configure Airtable first using the admin panel");
      return;
    }
    console.log("✅ Airtable configuration found");

    // Test 2: Get FAQs from Airtable
    console.log("📥 Fetching FAQs from Airtable...");
    const faqs = await AirtableService.getFAQs(1);
    console.log(`✅ Found ${faqs.length} FAQs in Airtable`);
    
    if (faqs.length > 0) {
      console.log("📋 Sample FAQs:");
      faqs.slice(0, 3).forEach((faq, index) => {
        console.log(`   ${index + 1}. Q: ${faq.question.substring(0, 50)}...`);
        console.log(`      A: ${faq.answer.substring(0, 50)}...`);
      });
    }

    // Test 3: Test FAQ search
    const testQuestion = "What is the difference between UTRADIE and AdminOh?";
    console.log(`\n�� Testing FAQ search with: "${testQuestion}"`);
    
    const searchResult = await AirtableService.searchFAQs(1, testQuestion);
    if (searchResult) {
      console.log("✅ FAQ search successful!");
      console.log(`   Match type: ${searchResult.matchType}`);
      console.log(`   Similarity: ${searchResult.semanticSimilarity || searchResult.keywordScore}`);
      console.log(`   Question: ${searchResult.question}`);
      console.log(`   Answer: ${searchResult.answer.substring(0, 100)}...`);
    } else {
      console.log("❌ No FAQ match found");
      console.log("📝 This could mean:");
      console.log("   - No similar questions in your Airtable");
      console.log("   - The similarity threshold is too high");
      console.log("   - The question format doesn't match");
    }

    // Test 4: Check FAQ embeddings
    const embeddingsResult = await pool.query("SELECT COUNT(*) as count FROM faq_embeddings WHERE business_id = 1");
    console.log(`\n📊 FAQ embeddings stored: ${embeddingsResult.rows[0].count}`);

  } catch (error) {
    console.error("❌ Error testing FAQ system:", error);
  } finally {
    await pool.end();
  }
}

// Run the test
testFAQSystem(); 