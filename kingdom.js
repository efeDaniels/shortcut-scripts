const axios = require('axios');
const readlineSync = require('readline-sync');

const BASE_URL = 'https://supreme-api-production.up.railway.app/metrics';

async function getCurrentEpoch(protocol) {
  try {
    const response = await axios.get(`${BASE_URL}/${protocol}`);
    if (response.data && response.data.current_epoch !== undefined) {
      console.log(`\nCurrent epoch: ${response.data.current_epoch}`);
    }
    return response.data;
  } catch (error) {
    console.error('Error details:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received from the server');
    } else {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

async function getMetrics(data, epoch) {
  if (!data || !data.metrics) {
    console.log('No data available');
    return;
  }

  const metrics = data.metrics;
  if (!Array.isArray(metrics)) {
    console.log('Invalid metrics data received');
    return;
  }

  const epochData = metrics.find(m => m.epoch === parseInt(epoch));
  
  if (!epochData) {
    console.log(`No data found for epoch ${epoch}`);
    return;
  }

  console.log(`\nMetrics for epoch ${epoch}:`);
  console.log('------------------------');
  console.log(`Fees (USD): $${epochData.fees_usd.toFixed(2)}`);
  console.log(`Bribes (USD): $${epochData.bribes_usd.toFixed(2)}`);
}

async function main() {
  const protocol = process.argv[2];
  
  if (!['nile', 'ramses', 'nuri'].includes(protocol)) {
    console.log('Please use one of the following commands:');
    console.log('npm run nile');
    console.log('npm run ramses');
    console.log('npm run nuri');
    return;
  }

  console.log(`Fetching data from ${BASE_URL}/${protocol}...`);
  const data = await getCurrentEpoch(protocol);
  
  if (data) {
    const epoch = readlineSync.question('Enter epoch number: ');
    await getMetrics(data, epoch);
  }
}

main();