const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const TOKEN_ADDRESS = "0x58024021Fe3eF613fA76e2f36A3Da97eb1454C36";
const RPC_URL = "https://zircuit1-mainnet.liquify.com";

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function getTopHolders() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const token = new ethers.Contract(TOKEN_ADDRESS, abi, provider);
  
  const filter = token.filters.Transfer();
  const events = await token.queryFilter(filter);
  const decimals = await token.decimals();
  
  const balances = new Map();
  
  for (const event of events) {
    const from = event.args[0];
    const to = event.args[1];
    const value = event.args[2];
    
    if (from !== ethers.ZeroAddress) {
      balances.set(from, (balances.get(from) || 0n) - value);
    }
    balances.set(to, (balances.get(to) || 0n) + value);
  }
  
  const holders = Array.from(balances.entries())
    .filter(([_, balance]) => balance > 0n)
    .sort(([, a], [, b]) => (b > a ? 1 : -1));
    
  return holders.map(([address, balance]) => ({
    address,
    balance: Number(ethers.formatUnits(balance, decimals))
  }));
}

async function saveToCSV() {
  const holders = await getTopHolders();
  const csvFilePath = path.join(__dirname, 'top_holders.csv');
  
  let csvContent = "Rank,Address,Balance\n";
  holders.slice(0, 100).forEach(({ address, balance }, index) => {
    csvContent += `${index + 1},${address},${balance}\n`;
  });
  
  fs.writeFileSync(csvFilePath, csvContent, 'utf8');
  console.log(`CSV file saved: ${csvFilePath}`);
}

saveToCSV().catch(console.error);
