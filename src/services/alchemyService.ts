import axios from 'axios';
import { HeliusWalletData } from './heliusService';

// ───────────────────────────────────────────────
// ALCHEMY API — Deep EVM forensic analysis
// ───────────────────────────────────────────────

// Map chainId to Alchemy Network Subdomains
const ALCHEMY_NETWORKS: Record<string, string> = {
    ethereum: 'eth-mainnet',
    base: 'base-mainnet',
    arbitrum: 'arb-mainnet',
    optimism: 'opt-mainnet',
    polygon: 'polygon-mainnet',
    bsc: 'bnb-mainnet', // Alchemy supports BNB now
};

const getAlchemyUrl = (chainId: string, apiKey: string) => {
    const network = ALCHEMY_NETWORKS[chainId] || 'eth-mainnet';
    return `https://${network}.g.alchemy.com/v2/${apiKey}`;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

const getApiKey = () => import.meta.env.VITE_ALCHEMY_API_KEY || '';

// Excluded addresses (DEX routers, Null address, etc.)
const EXCLUDED_ADDRESSES = new Set([
    '0x0000000000000000000000000000000000000000', // Null
    '0x000000000000000000000000000000000000dead', // Dead
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap V3 Router
    '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Matcha
]);

const isExcluded = (addr: string) => EXCLUDED_ADDRESSES.has(addr.toLowerCase());

// ───────────────────────────────────────────────
// Core Trace Function
// ───────────────────────────────────────────────

export const traceEvmDistributionTree = async (
    seedAddresses: string[],
    tokenAddress: string,
    chainId: string
): Promise<HeliusWalletData[]> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn('[Alchemy] No API key configured');
        return [];
    }

    const MAX_TOTAL_WALLETS = 400; // Same as Helius cap
    const knownAddresses = new Set<string>();
    const results: HeliusWalletData[] = [];

    console.log(`[Alchemy] ═══ EVM DISTRIBUTION TRACE (${chainId.toUpperCase()}) ═══`);
    console.log(`[Alchemy] Token: ${tokenAddress}`);
    console.log(`[Alchemy] Seed wallets: ${seedAddresses.length}`);

    // ── LEVEL 0: Analyze Seed Wallets ──
    // For EVM, we need to fetch their balances and outgoing transfers
    for (const wallet of seedAddresses) {
        if (isExcluded(wallet)) continue;
        knownAddresses.add(wallet);

        const data = await fetchEvmWalletData(wallet, tokenAddress, chainId, apiKey, true, 0);
        results.push(data);
        await delay(100); // Rate limit protection
    }

    console.log(`[Alchemy] Level 0 complete: ${results.length} seed wallets analyzed`);

    // ── LEVEL 1: Trace Recipients ──
    const level1Addresses = new Set<string>();
    results.forEach(w => {
        w.outgoingTransfers.forEach(t => {
            if (!knownAddresses.has(t.to) && !isExcluded(t.to)) {
                level1Addresses.add(t.to);
            }
        });
    });

    const level1Array = [...level1Addresses].slice(0, MAX_TOTAL_WALLETS - results.length);
    console.log(`[Alchemy] ── Level 1: Found ${level1Array.length} recipients`);

    for (const wallet of level1Array) {
        if (results.length >= MAX_TOTAL_WALLETS) break;
        knownAddresses.add(wallet);
        const data = await fetchEvmWalletData(wallet, tokenAddress, chainId, apiKey, false, 1);
        results.push(data);
        await delay(100);
    }

    // ── LEVEL 2: Trace Sub-Recipients ──
    const level2Addresses = new Set<string>();
    results.filter(r => r.traceDepth === 1).forEach(w => {
        w.outgoingTransfers.forEach(t => {
            if (!knownAddresses.has(t.to) && !isExcluded(t.to)) {
                level2Addresses.add(t.to);
            }
        });
    });

    const level2Array = [...level2Addresses].slice(0, MAX_TOTAL_WALLETS - results.length);
    console.log(`[Alchemy] ── Level 2: Found ${level2Array.length} sub-recipients`);

    for (const wallet of level2Array) {
        if (results.length >= MAX_TOTAL_WALLETS) break;
        knownAddresses.add(wallet);
        const data = await fetchEvmWalletData(wallet, tokenAddress, chainId, apiKey, false, 2);
        results.push(data);
        await delay(100);
    }

    // ── LEVEL 3: End Holders (Balance Check Only) ──
    const level3Addresses = new Set<string>();
    results.filter(r => r.traceDepth === 2).forEach(w => {
        w.outgoingTransfers.forEach(t => {
            if (!knownAddresses.has(t.to) && !isExcluded(t.to)) {
                level3Addresses.add(t.to);
            }
        });
    });

    const level3Array = [...level3Addresses].slice(0, MAX_TOTAL_WALLETS - results.length);
    console.log(`[Alchemy] ── Level 3: Found ${level3Array.length} end-holders`);

    if (level3Array.length > 0) {
        // Batch balance check for efficiency
        const balances = await batchGetEvmBalances(level3Array, tokenAddress, chainId, apiKey);
        for (const [addr, balance] of balances) {
            if (results.length >= MAX_TOTAL_WALLETS) break;
            knownAddresses.add(addr);
            results.push({
                address: addr,
                buys: [],
                sells: [], // No history for L3, just existence
                outgoingTransfers: [],
                incomingTransfers: [],
                currentBalance: balance,
                isSeedWallet: false,
                traceDepth: 3,
            });
        }
    }

    return results;
};

// ───────────────────────────────────────────────
// Fetch Single Wallet Data (Transfers + Balance)
// ───────────────────────────────────────────────

const fetchEvmWalletData = async (
    wallet: string,
    tokenAddress: string,
    chainId: string,
    apiKey: string,
    isSeed: boolean,
    depth: number
): Promise<HeliusWalletData> => {
    const url = getAlchemyUrl(chainId, apiKey);

    // parallel fetch: asset transfers + balance
    const [transfers, balance] = await Promise.all([
        getAssetTransfers(wallet, tokenAddress, url),
        getTokenBalance(wallet, tokenAddress, url)
    ]);

    // Classify transfers as incoming/outgoing based on wallet direction.
    // DEX swap identification requires full DEX log decoding — currently handled at the Analyzer layer.
    const { buys, sells, incomingTransfers, outgoingTransfers } = classifyTransfers(transfers, wallet);

    console.log(`[Alchemy] L${depth} ${wallet.slice(0, 6)}: ${transfers.length} txs, Bal: ${balance.toFixed(2)}`);

    return {
        address: wallet,
        buys,
        sells,
        outgoingTransfers,
        incomingTransfers,
        currentBalance: balance,
        isSeedWallet: isSeed,
        traceDepth: depth
    };
};

// ───────────────────────────────────────────────
// Alchemy RPC Methods
// ───────────────────────────────────────────────

interface AlchemyTransfer {
    from: string;
    to: string;
    value: number;
    hash: string;
    blockNum: string;
}

const getAssetTransfers = async (wallet: string, tokenAddress: string, url: string): Promise<AlchemyTransfer[]> => {
    try {
        const payload = {
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getAssetTransfers",
            params: [
                {
                    fromBlock: "0x0",
                    toBlock: "latest",
                    fromAddress: wallet,
                    contractAddresses: [tokenAddress],
                    category: ["erc20"],
                    withMetadata: false
                }
            ]
        };

        // Fetch both inbound and outbound transfers via separate Alchemy calls.
        const [outRes, inRes] = await Promise.all([
            axios.post(url, payload), // Outgoing
            axios.post(url, { ...payload, params: [{ ...payload.params[0], fromAddress: undefined, toAddress: wallet }] }) // Incoming
        ]);

        const outTxs = outRes.data?.result?.transfers || [];
        const inTxs = inRes.data?.result?.transfers || [];

        return [...outTxs, ...inTxs];
    } catch (e) {
        console.warn(`[Alchemy] Failed transfers fetch for ${wallet}`, e);
        return [];
    }
};

const getTokenBalance = async (wallet: string, tokenAddress: string, url: string): Promise<number> => {
    try {
        const res = await axios.post(url, {
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getTokenBalances",
            params: [wallet, [tokenAddress]]
        });

        const hexBal = res.data?.result?.tokenBalances?.[0]?.tokenBalance;
        if (!hexBal || hexBal === '0x') return 0;

        // Default to 18 decimal precision. Token metadata resolution is handled upstream.
        return parseInt(hexBal, 16) / 1e18;
    } catch (e) {
        return 0;
    }
};

const batchGetEvmBalances = async (wallets: string[], tokenAddress: string, chainId: string, apiKey: string) => {
    const url = getAlchemyUrl(chainId, apiKey);
    const results = new Map<string, number>();

    // Batch balance lookups via parallel chunked requests to alchemy_getTokenBalances.
    const chunk = 5;
    for (let i = 0; i < wallets.length; i += chunk) {
        const batch = wallets.slice(i, i + chunk);
        await Promise.all(batch.map(async w => {
            const bal = await getTokenBalance(w, tokenAddress, url);
            results.set(w, bal);
        }));
    }
    return results;
};

// ───────────────────────────────────────────────
// Classification Logic
// ───────────────────────────────────────────────

const classifyTransfers = (transfers: AlchemyTransfer[], wallet: string) => {
    const buys: HeliusWalletData['buys'] = [];
    const sells: HeliusWalletData['sells'] = [];
    const outgoingTransfers: HeliusWalletData['outgoingTransfers'] = [];
    const incomingTransfers: HeliusWalletData['incomingTransfers'] = [];

    // Classify by transfer direction. Contract-level DEX detection is planned for a future iteration.

    transfers.forEach(t => {
        const amount = t.value;
        const timestamp = 0; // Alchemy transfer doesn't give timestamp directly in lightweight mode

        if (t.from.toLowerCase() === wallet.toLowerCase()) {
            // Outbound transfer — buy/sell classification is deferred to the Analyzer layer.
            outgoingTransfers.push({ to: t.to, tokenAmount: amount, timestamp });
        } else {
            // IN
            incomingTransfers.push({ from: t.from, tokenAmount: amount, timestamp });
        }
    });

    return { buys, sells, outgoingTransfers, incomingTransfers };
};
