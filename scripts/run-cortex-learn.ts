// Simple local trigger stub (documentation helper).
// In CI or local dev, you can invoke the function:
// supabase functions serve --env-file ./supabase/.env && curl -i http://localhost:54321/functions/v1/cortex-learn

console.log('To test the cortex-learn edge function locally:');
console.log('');
console.log('1. Start functions server:');
console.log('   supabase functions serve --env-file ./supabase/.env');
console.log('');
console.log('2. Trigger the function:');
console.log('   curl -i http://localhost:54321/functions/v1/cortex-learn');
console.log('');
console.log('3. Check response for { "updated": N } where N is count of users processed');
