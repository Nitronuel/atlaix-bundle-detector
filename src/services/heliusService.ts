import axios from 'axios';

// ───────────────────────────────────────────────
// Helius API — Deep Solana forensic analysis
// ───────────────────────────────────────────────

const HELIUS_BASE = 'https://api.helius.xyz';

// ── Types ──

export interface HeliusTokenTransfer {
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
}

export interface HeliusNativeTransfer {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number; // Lamports
}

export interface HeliusTransaction {
    signature: string;
    type: string;           // 'SWAP' | 'TRANSFER' | 'UNKNOWN' | etc.
    source: string;         // 'RAYDIUM' | 'JUPITER' | 'PUMP_FUN' | etc.
    slot: number;
    timestamp: number;
    feePayer: string;
    tokenTransfers: HeliusTokenTransfer[];
    nativeTransfers: HeliusNativeTransfer[];
}

export interface FundingSource {
    address: string;
    amount: number;
    timestamp: number;
    isCex: boolean;
}

export interface HeliusWalletData {
    address: string;
    buys: { tokenAmount: number; timestamp: number }[];
    sells: { tokenAmount: number; timestamp: number }[];
    outgoingTransfers: { to: string; tokenAmount: number; timestamp: number }[];
    incomingTransfers: { from: string; tokenAmount: number; timestamp: number }[];
    currentBalance: number;
    isSeedWallet: boolean;   // Was this wallet a block 0-2 buyer?
    traceDepth: number;      // 0 = seed, 1 = level 1 recipient, 2 = level 2
    fundingSource?: FundingSource; // Wallet or CEX that funded this account
}

// ── Helpers ──

const getApiKey = (): string => {
    // Universal support: Vite (Browser) or Process (Node.js)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env.VITE_HELIUS_API_KEY || '';
    }
    return process.env.VITE_HELIUS_API_KEY || '';
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Known addresses to exclude from distribution tracing
// Includes DEX programs, system programs, LP pools, pump.fun infrastructure
const EXCLUDED_ADDRESSES = new Set([
    '11111111111111111111111111111111',          // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // ATA Program
    'So11111111111111111111111111111111111111112',    // Wrapped SOL
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter v6
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',  // Jupiter v4
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpool
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',  // Raydium V4
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',  // Raydium CPMM
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',  // Raydium CP
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun Program
    'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjQ7GWkRjQpM', // Pump.fun Fee Account
    'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM', // Pump.fun Authority
    '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg', // Pump.fun Migration
]);

// Known CEX and exchange hot wallets for funding source classification
const KNOWN_CEX_ADDRESSES = new Set([
    '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', // Binance 2
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Binance 3
    '53unSgGWqEWANcPYRF35B2Bgf8BkszUtcccKiXwGGLyr', // Binance US
    'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE', // Coinbase 2
    '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfBKCoF3gKsGb2', // Coinbase Cold
    '6LY1JzAFVZsP2a2xKrtU6znQMQ5h4i7tocWdgrkZzkzF', // Kraken
    'is6MTRHEgyFLNTfYcuV4QBWLjrZBfmhVNYR6ccgr8KV', // OKX
    'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHm5xd8nudL', // MEXC
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Raydium Authority (often funds LPs)
]);

// Dynamic exclusion: addresses that look like LP/DEX pools
const isExcludedAddress = (addr: string): boolean => {
    if (!addr || addr.length < 20) return true;
    if (EXCLUDED_ADDRESSES.has(addr)) return true;
    return false;
};

// Fetch all parsed transactions for a wallet
// Note: No type filter is applied because DEX interactions (e.g. pump.fun)
// may be classified as 'UNKNOWN'. Filtering is done by mint address instead.

const fetchWalletTransactions = async (
    walletAddress: string,
    apiKey: string
): Promise<HeliusTransaction[]> => {
    try {
        const res = await axios.get(
            `${HELIUS_BASE}/v0/addresses/${walletAddress}/transactions`,
            { params: { 'api-key': apiKey, limit: 100 } } // Increased limit to find funding
        );
        return res.data || [];
    } catch (err: any) {
        console.warn(`[Helius] Failed to fetch txs for ${walletAddress.slice(0, 8)}:`, err?.response?.status);
        return [];
    }
};

// Get current token balance for a wallet via RPC
// Supports both standard Token Program and Token-2022 Program



const getWalletTokenBalance = async (
    walletAddress: string,
    mintAddress: string,
    apiKey: string
): Promise<number> => {
    try {
        // Try standard Token Program first
        const res = await axios.post(
            `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    walletAddress,
                    { mint: mintAddress },
                    { encoding: 'jsonParsed' }
                ],
            }
        );

        const accounts = res.data?.result?.value || [];
        if (accounts.length > 0) {
            return parseFloat(accounts[0].account.data.parsed.info.tokenAmount.uiAmountString || '0');
        }

        // If no accounts found, try Token2022 program
        const res2022 = await axios.post(
            `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'getTokenAccountsByOwner',
                params: [
                    walletAddress,
                    { mint: mintAddress },
                    {
                        encoding: 'jsonParsed',
                        commitment: 'confirmed',
                    }
                ],
            }
        );

        const accounts2022 = res2022.data?.result?.value || [];
        if (accounts2022.length > 0) {
            return parseFloat(accounts2022[0].account.data.parsed.info.tokenAmount.uiAmountString || '0');
        }

        return 0;
    } catch (err: any) {
        console.warn(`[Helius] Balance check failed for ${walletAddress.slice(0, 8)}:`, err?.response?.status);
        return 0;
    }
};

// ───────────────────────────────────────────────
// Batch balance check for multiple wallets
// ───────────────────────────────────────────────

const batchGetBalances = async (
    addresses: string[],
    mintAddress: string,
    apiKey: string,
    batchSize: number = 5
): Promise<Map<string, number>> => {
    const balances = new Map<string, number>();

    for (let i = 0; i < addresses.length; i += batchSize) {
        const batch = addresses.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(addr => getWalletTokenBalance(addr, mintAddress, apiKey))
        );
        batch.forEach((addr, idx) => balances.set(addr, results[idx]));
        if (i + batchSize < addresses.length) await delay(50);
    }

    return balances;
};

// ───────────────────────────────────────────────
// MAIN: Trace distribution tree from seed wallets
// ───────────────────────────────────────────────

export const traceDistributionTree = async (
    seedAddresses: string[],
    mintAddress: string
): Promise<HeliusWalletData[]> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn('[Helius] No API key configured');
        return [];
    }

    const MAX_TOTAL_WALLETS = 400;
    const knownAddresses = new Set<string>();
    const results: HeliusWalletData[] = [];

    console.log(`[Helius] ═══ DISTRIBUTION TREE TRACE (DEEP SCAN) ═══`);
    console.log(`[Helius] Mint: ${mintAddress}`);
    console.log(`[Helius] Seed wallets: ${seedAddresses.length}`);

    // ── LEVEL 0: Full analysis of seed wallets ──
    console.log(`[Helius] ── Level 0: Analyzing ${seedAddresses.length} seed wallets (block 0-5 buyers)...`);

    for (const wallet of seedAddresses) {
        if (isExcludedAddress(wallet)) {
            console.log(`[Helius] Skipping excluded seed: ${wallet.slice(0, 8)}...`);
            continue;
        }
        knownAddresses.add(wallet);

        const walletData = await fetchFullWalletData(wallet, mintAddress, apiKey, true, 0);
        results.push(walletData);
        await delay(50);
    }

    console.log(`[Helius] Level 0 complete: ${results.length} seed wallets analyzed`);

    // ── LEVEL 1: Trace distribution recipients from seed wallets ──
    const level1Addresses = new Set<string>();

    results.forEach(w => {
        w.outgoingTransfers.forEach(t => {
            if (!knownAddresses.has(t.to) && !isExcludedAddress(t.to)) {
                level1Addresses.add(t.to);
            }
        });
    });

    console.log(`[Helius] ── Level 1: Found ${level1Addresses.size} distribution recipients from seed wallets`);

    const level1Array = [...level1Addresses].slice(0, Math.min(level1Addresses.size, MAX_TOTAL_WALLETS - results.length));

    for (const wallet of level1Array) {
        if (results.length >= MAX_TOTAL_WALLETS) break;
        knownAddresses.add(wallet);

        const walletData = await fetchTransferWalletData(wallet, mintAddress, apiKey, 1);
        results.push(walletData);
        await delay(50);
    }

    console.log(`[Helius] Level 1 complete: ${level1Array.length} wallets analyzed | Total: ${results.length}`);

    // ── LEVEL 2: Trace further distributions from level 1 wallets ──
    const level2Addresses = new Set<string>();

    // Start looking from where Level 1 wallets began in the results array
    const level1Results = results.filter(r => r.traceDepth === 1);

    level1Results.forEach(w => {
        w.outgoingTransfers.forEach(t => {
            if (!knownAddresses.has(t.to) && !isExcludedAddress(t.to)) {
                level2Addresses.add(t.to);
            }
        });
    });

    console.log(`[Helius] ── Level 2: Found ${level2Addresses.size} secondary distribution recipients`);

    const level2Array = [...level2Addresses].slice(0, Math.min(level2Addresses.size, MAX_TOTAL_WALLETS - results.length));

    // For Level 2, we now do a FULL fetch (transfers + balance) instead of just balance
    // This allows us to find Level 3 recipients
    for (const wallet of level2Array) {
        if (results.length >= MAX_TOTAL_WALLETS) break;
        knownAddresses.add(wallet);

        const walletData = await fetchTransferWalletData(wallet, mintAddress, apiKey, 2);
        results.push(walletData);
        await delay(50);
    }

    console.log(`[Helius] Level 2 complete: ${level2Array.length} wallets analyzed | Total: ${results.length}`);

    // ── LEVEL 3: Trace further distributions from level 2 wallets ──
    // This captures the "End Holders" after a 3-hop mix
    const level3Addresses = new Set<string>();

    const level2Results = results.filter(r => r.traceDepth === 2);

    level2Results.forEach(w => {
        w.outgoingTransfers.forEach(t => {
            if (!knownAddresses.has(t.to) && !isExcludedAddress(t.to)) {
                level3Addresses.add(t.to);
            }
        });
    });

    console.log(`[Helius] ── Level 3: Found ${level3Addresses.size} tertiary distribution recipients`);

    const level3Array = [...level3Addresses].slice(0, Math.min(level3Addresses.size, MAX_TOTAL_WALLETS - results.length));

    if (level3Array.length > 0) {
        console.log(`[Helius] Level 3: Batch-checking balances for ${level3Array.length} wallets...`);
        // Level 3 is the end of the line (for now) -> Balance check only
        const level3Balances = await batchGetBalances(level3Array, mintAddress, apiKey);

        for (const [addr, balance] of level3Balances) {
            if (results.length >= MAX_TOTAL_WALLETS) break;
            knownAddresses.add(addr);

            results.push({
                address: addr,
                buys: [],
                sells: [],
                outgoingTransfers: [],
                incomingTransfers: [],
                currentBalance: balance,
                isSeedWallet: false,
                traceDepth: 3,
            });
        }
    }

    // ── Summary ──
    const seedCount = results.filter(r => r.traceDepth === 0).length;
    const l1Count = results.filter(r => r.traceDepth === 1).length;
    const l2Count = results.filter(r => r.traceDepth === 2).length;
    const l3Count = results.filter(r => r.traceDepth === 3).length;
    const totalBalance = results.reduce((s, r) => s + r.currentBalance, 0);
    console.log(`[Helius] ═══ TRACE COMPLETE ═══`);
    console.log(`[Helius] Total: ${results.length} wallets | L0: ${seedCount}, L1: ${l1Count}, L2: ${l2Count}, L3: ${l3Count}`);
    console.log(`[Helius] Total token balance across all traced wallets: ${totalBalance.toLocaleString()}`);

    return results;
};

// Legacy export alias for backward compatibility
export const analyzeBlock0Wallets = traceDistributionTree;

// ───────────────────────────────────────────────
// Full wallet data fetch (ALL txs + balance)
// Uses updated HeliusTransaction with nativeTransfers
// ───────────────────────────────────────────────

const fetchFullWalletData = async (
    wallet: string,
    mintAddress: string,
    apiKey: string,
    isSeed: boolean,
    depth: number
): Promise<HeliusWalletData> => {
    // Fetch ALL parsed transactions + current balance in parallel
    const [allTxs, currentBalance] = await Promise.all([
        fetchWalletTransactions(wallet, apiKey),
        getWalletTokenBalance(wallet, mintAddress, apiKey),
    ]);

    const { buys, sells } = parseSwaps(allTxs, wallet, mintAddress);
    const { outgoingTransfers, incomingTransfers } = parseTransfers(allTxs, wallet, mintAddress);

    // Trace the SOL funding source for this wallet
    const fundingSource = traceFundingSource(allTxs, wallet, buys[0]?.timestamp || Date.now() / 1000);

    const fundingLog = fundingSource ? `Funded by ${fundingSource.address.slice(0, 6)}...` : 'No clear funding source';
    console.log(`[Helius] L${depth} ${wallet.slice(0, 8)}: ${allTxs.length} txs, ${buys.length} buys. ${fundingLog}`);

    return {
        address: wallet,
        buys,
        sells,
        outgoingTransfers,
        incomingTransfers,
        currentBalance,
        isSeedWallet: isSeed,
        traceDepth: depth,
        fundingSource,
    };
};

// ───────────────────────────────────────────────
// Transfer-focused wallet data fetch (ALL txs + balance)
// ───────────────────────────────────────────────

const fetchTransferWalletData = async (
    wallet: string,
    mintAddress: string,
    apiKey: string,
    depth: number
): Promise<HeliusWalletData> => {
    // Fetch ALL transactions + balance
    const [allTxs, currentBalance] = await Promise.all([
        fetchWalletTransactions(wallet, apiKey),
        getWalletTokenBalance(wallet, mintAddress, apiKey),
    ]);

    const { buys, sells } = parseSwaps(allTxs, wallet, mintAddress);
    const { outgoingTransfers, incomingTransfers } = parseTransfers(allTxs, wallet, mintAddress);

    // For sub-wallets, we also care about funding source (did the Seed Wallet fund them?)
    const fundingSource = traceFundingSource(allTxs, wallet, buys[0]?.timestamp || Date.now() / 1000);

    return {
        address: wallet,
        buys,
        sells,
        outgoingTransfers,
        incomingTransfers,
        currentBalance,
        isSeedWallet: false,
        traceDepth: depth,
        fundingSource,
    };
};

/**
 * Identify the likely funding source (SOL sender) for a wallet.
 * Looks for the most significant SOL transfer *before* the first token buy.
 */
const traceFundingSource = (
    txs: HeliusTransaction[],
    wallet: string,
    firstBuyTimestamp: number
): FundingSource | undefined => {
    // Filter for native SOL transfers TO this wallet
    const fundingTxs = txs.filter(tx =>
        tx.nativeTransfers &&
        tx.nativeTransfers.some(nt => nt.toUserAccount === wallet && nt.amount > 10000000) // > 0.01 SOL (ignore dust)
    );

    // Sort by timestamp descending (newest first)
    // We want the transfer closest to (but before) the buy time
    // Or if no buy (distribution wallet), just the earliest big funding
    fundingTxs.sort((a, b) => b.timestamp - a.timestamp);

    let best: HeliusTransaction | undefined;

    // 1. Look for funding immediately before first buy (within 24h)
    best = fundingTxs.find(tx => tx.timestamp < firstBuyTimestamp && tx.timestamp > firstBuyTimestamp - 86400);

    // 2. If not found, just take the earliest funding tx we have (wallet creation)
    if (!best && fundingTxs.length > 0) {
        best = fundingTxs[fundingTxs.length - 1]; // Oldest tx
    }

    if (!best) return undefined;

    // Extract the sender
    const transfer = best.nativeTransfers.find(nt => nt.toUserAccount === wallet);
    if (!transfer) return undefined;

    const sender = transfer.fromUserAccount;
    const isCex = KNOWN_CEX_ADDRESSES.has(sender);

    return {
        address: sender,
        amount: transfer.amount,
        timestamp: best.timestamp,
        isCex
    };
};

// ── Parsing helpers ──

const parseSwaps = (
    allTxs: HeliusTransaction[],
    wallet: string,
    mintAddress: string
) => {
    const buys: HeliusWalletData['buys'] = [];
    const sells: HeliusWalletData['sells'] = [];

    allTxs.forEach(tx => {
        if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) return;

        // A "swap" is any transaction where the wallet gains or loses the target token
        // through a DEX interaction (SWAP type) or direct bonding curve interaction (UNKNOWN type)
        const isSwapLike = tx.type === 'SWAP' || tx.type === 'UNKNOWN' || tx.source === 'PUMP_FUN';
        if (!isSwapLike) return;

        tx.tokenTransfers.forEach(tt => {
            if (tt.mint !== mintAddress) return;
            if (tt.tokenAmount <= 0) return;

            if (tt.toUserAccount === wallet && tt.fromUserAccount !== wallet) {
                buys.push({ tokenAmount: tt.tokenAmount, timestamp: tx.timestamp });
            } else if (tt.fromUserAccount === wallet && tt.toUserAccount !== wallet) {
                sells.push({ tokenAmount: tt.tokenAmount, timestamp: tx.timestamp });
            }
        });
    });

    return { buys, sells };
};

const parseTransfers = (
    allTxs: HeliusTransaction[],
    wallet: string,
    mintAddress: string
) => {
    const outgoingTransfers: HeliusWalletData['outgoingTransfers'] = [];
    const incomingTransfers: HeliusWalletData['incomingTransfers'] = [];

    allTxs.forEach(tx => {
        if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) return;

        // A "transfer" is a direct token send (TRANSFER type) or any non-swap movement
        // For distribution tracing, we care about ALL token movements of the target mint
        tx.tokenTransfers.forEach(tt => {
            if (tt.mint !== mintAddress) return;
            if (tt.tokenAmount <= 0) return;

            // Skip if both sides are the same wallet (self-transfer)
            if (tt.fromUserAccount === tt.toUserAccount) return;

            // Skip excluded addresses (DEX pools, programs)
            if (isExcludedAddress(tt.fromUserAccount) || isExcludedAddress(tt.toUserAccount)) return;

            if (tt.fromUserAccount === wallet) {
                outgoingTransfers.push({
                    to: tt.toUserAccount,
                    tokenAmount: tt.tokenAmount,
                    timestamp: tx.timestamp,
                });
            } else if (tt.toUserAccount === wallet) {
                incomingTransfers.push({
                    from: tt.fromUserAccount,
                    tokenAmount: tt.tokenAmount,
                    timestamp: tx.timestamp,
                });
            }
        });
    });

    return { outgoingTransfers, incomingTransfers };
};
