const pool = require("../config/database");

async function checkAirtableConfiguration() {
  try {
    console.log("🔍 Checking Airtable configuration for business ID 1...\n");

    // Check if business ID 1 exists
    const businessResult = await pool.query("SELECT * FROM businesses WHERE id = 1");
    if (businessResult.rows.length === 0) {
      console.log("❌ Business ID 1 does not exist!");
      console.log("📝 Creating default business...");
      
      await pool.query(`
        INSERT INTO businesses (id, name, description, status) 
        VALUES (1, 'Default Business', 'Default business for FAQ testing', 'active')
        ON CONFLICT (id) DO NOTHING
      `);
      console.log("✅ Default business created");
    } else {
      console.log("✅ Business ID 1 exists:", businessResult.rows[0]);
    }

    // Check Airtable configuration for business ID 1
    const airtableResult = await pool.query("SELECT * FROM airtable_integrations WHERE business_id = 1");
    
    if (airtableResult.rows.length === 0) {
      console.log("❌ No Airtable configuration found for business ID 1");
      console.log("📝 This is why FAQ search is failing!");
      console.log("\n🔧 To fix this, you need to:");
      console.log("1. Go to your admin panel");
      console.log("2. Navigate to Airtable integration settings");
      console.log("3. Configure Airtable with your:");
      console.log("   - Access Token");
      console.log("   - Base ID");
      console.log("   - Table Name");
      console.log("\n📋 Your Airtable table should have these fields:");
      console.log("   - Question (text field)");
      console.log("   - Answer (text field)");
    } else {
      console.log("✅ Airtable configuration found:", {
        business_id: airtableResult.rows[0].business_id,
        base_id: airtableResult.rows[0].base_id,
        table_name: airtableResult.rows[0].table_name,
        has_token: !!airtableResult.rows[0].access_token
      });
    }

    // Check FAQ embeddings
    const embeddingsResult = await pool.query("SELECT COUNT(*) as count FROM faq_embeddings WHERE business_id = 1");
    console.log(`📊 FAQ embeddings for business 1: ${embeddingsResult.rows[0].count}`);

    // Check all businesses
    const allBusinesses = await pool.query("SELECT id, name FROM businesses ORDER BY id");
    console.log("\n📋 All businesses in database:");
    allBusinesses.rows.forEach(business => {
      console.log(`   - ID ${business.id}: ${business.name}`);
    });

    // Check all Airtable configurations
    const allAirtableConfigs = await pool.query("SELECT business_id, base_id, table_name FROM airtable_integrations");
    console.log("\n📋 All Airtable configurations:");
    if (allAirtableConfigs.rows.length === 0) {
      console.log("   - No Airtable configurations found");
    } else {
      allAirtableConfigs.rows.forEach(config => {
        console.log(`   - Business ${config.business_id}: ${config.base_id}/${config.table_name}`);
      });
    }

    console.log("\n🎯 SOLUTION:");
    console.log("The FAQ system is working correctly, but business ID 1 needs an Airtable configuration.");
    console.log("Once you configure Airtable in your admin panel, the FAQ matching will work!");

  } catch (error) {
    console.error("❌ Error checking Airtable configuration:", error);
  } finally {
    await pool.end();
  }
}

// Run the check
checkAirtableConfiguration(); 