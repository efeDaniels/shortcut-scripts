
async function sumBribes() {
    const url = 'https://eqapi-sonic-prod-ltanm.ondigitalocean.app/sonic/v4/gauges/bribes';
  
    try {

      const response = await fetch(url);
      const json = await response.json();
  
      const gaugesData = json.data || {};
  
      // Sum up all totalBribeValueUsd
      let totalBribes = 0;
      for (const gaugeId in gaugesData) {
        const gauge = gaugesData[gaugeId];

        const bribeValue = parseFloat(gauge.totalBribeValueUsd);
        totalBribes += isNaN(bribeValue) ? 0 : bribeValue;
      }
  
      console.log(`Total of all bribes (USD): ${totalBribes.toFixed(2)}`);
    } catch (error) {
      console.error('Error fetching or processing data:', error);
    }
  }
  
  sumBribes();
  