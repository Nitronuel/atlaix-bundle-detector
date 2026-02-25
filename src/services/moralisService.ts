import axios from 'axios';

// ───────────────────────────────────────────────
// Moralis API Base URLs
// ───────────────────────────────────────────────
const EVM_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const SOLANA_BASE_URL = 'https://solana-gateway.moralis.io';

// ───────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────

/** Normalized forensic data (works for both EVM and Solana) */
export interface ForensicData {
    holders: NormalizedHolder[];
    block0Transfers: NormalizedTransfer[];
    earlyTransfers: NormalizedTransfer[];
    creationBlock: number;
    chain: string;
}

/** A normalized transfer/swap — same shape regardless of chain */
export interface NormalizedTransfer {
    txHash: string;
    blockNumber: number;
    buyerAddress: string;       // who received/bought the tokens
    sellerAddress: string;      // who sent/sold (zero-address = mint)
    tokenAmount: number;        // actual token amount (decimals applied)
    usdValue: number;           // USD value of the transfer
    transactionType: string;    // 'buy', 'sell', 'transfer', 'mint'
}

/** A normalized holder */
export interface NormalizedHolder {
    address: string;
    balance: number;            // formatted balance
    percentage: number;         // % of total supply
    usdValue: number;
}

// ───────────────────────────────────────────────
// Chain helpers
// ───────────────────────────────────────────────
const EVM_CHAINS = ['ethereum', 'bsc', 'base', 'polygon', 'arbitrum', 'optimism'];

const mapChainToMoralisHex = (chainId: string): string => {
    const map: Record<string, string> = {
        ethereum: '0x1', bsc: '0x38', base: '0x2105',
        polygon: '0x89', arbitrum: '0xa4b1', optimism: '0xa',
    };
    return map[chainId] || '0x1';
};

const isEvmChain = (chainId: string): boolean => EVM_CHAINS.includes(chainId);
const isSolanaChain = (chainId: string): boolean => chainId === 'solana';

// ───────────────────────────────────────────────
// MAIN ENTRY POINT
// ───────────────────────────────────────────────

export const getTokenForensics = async (
    chainId: string,
    tokenAddress: string
): Promise<ForensicData | null> => {
    const apiKey = (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env.VITE_MORALIS_API_KEY
        : process.env.VITE_MORALIS_API_KEY;
    if (!apiKey) {
        console.error('[Moralis] Missing VITE_MORALIS_API_KEY');
        return null;
    }

    if (isSolanaChain(chainId)) {
        return fetchSolanaForensics(tokenAddress, apiKey);
    }

    if (isEvmChain(chainId)) {
        return fetchEvmForensics(chainId, tokenAddress, apiKey);
    }

    console.warn(`[Moralis] Chain '${chainId}' is not supported.`);
    return null;
};

// ═══════════════════════════════════════════════
// SOLANA FORENSICS (priority — using real swap + holder data)
// ═══════════════════════════════════════════════

const fetchSolanaForensics = async (
    tokenAddress: string,
    apiKey: string
): Promise<ForensicData | null> => {
    const headers = { 'X-API-Key': apiKey, 'accept': 'application/json' };

    try {
        // ── 1. Fetch swap history (oldest first → find launch buys) ──
        let swaps: any[] = [];
        try {
            const swapsRes = await axios.get(
                `${SOLANA_BASE_URL}/token/mainnet/${tokenAddress}/swaps`,
                { params: { order: 'ASC', limit: 100 }, headers }
            );
            swaps = swapsRes.data?.result || [];
            console.log(`[Moralis Solana] Fetched ${swaps.length} swaps`);
        } catch (err: any) {
            console.warn('[Moralis Solana] Swap endpoint error:', err?.response?.status, err?.response?.data?.message || '');
        }

        // ── 2. Fetch top holders ──
        let holders: any[] = [];
        try {
            const holdersRes = await axios.get(
                `${SOLANA_BASE_URL}/token/mainnet/${tokenAddress}/top-holders`,
                { headers }
            );
            holders = holdersRes.data?.result || [];
            console.log(`[Moralis Solana] Fetched ${holders.length} holders`);
        } catch (err: any) {
            console.warn('[Moralis Solana] Top-holders endpoint error:', err?.response?.status, err?.response?.data?.message || '');
        }

        if (swaps.length === 0 && holders.length === 0) {
            console.warn('[Moralis Solana] No data returned for this token.');
            return {
                holders: [],
                block0Transfers: [],
                earlyTransfers: [],
                creationBlock: 0,
                chain: 'solana',
            };
        }

        // ── 3. Normalize swaps into NormalizedTransfer[] ──
        const normalizedSwaps: NormalizedTransfer[] = swaps.map((swap: any) => {
            const isBuy = swap.transactionType === 'buy';
            // For a "buy", the buyer is the walletAddress, they bought tokens
            // For a "sell", the wallet sold tokens
            const tokenData = isBuy ? swap.bought : swap.sold;
            const tokenAmount = parseFloat(tokenData?.amount || '0');

            return {
                txHash: swap.transactionHash || '',
                blockNumber: Number(swap.blockNumber || 0),
                buyerAddress: swap.walletAddress || '',
                sellerAddress: '', // Solana swap data doesn't expose the counterparty
                tokenAmount,
                usdValue: parseFloat(swap.totalValueUsd || '0'),
                transactionType: swap.transactionType || 'unknown',
            };
        });

        // Sort by block (slot) ascending
        normalizedSwaps.sort((a, b) => a.blockNumber - b.blockNumber);

        // Only consider BUY transactions for bundle detection
        const buySwaps = normalizedSwaps.filter(s => s.transactionType === 'buy');

        if (buySwaps.length === 0) {
            console.warn('[Moralis Solana] No buy swaps found.');
            return {
                holders: normalizeSolanaHolders(holders),
                block0Transfers: [],
                earlyTransfers: [],
                creationBlock: 0,
                chain: 'solana',
            };
        }

        const creationSlot = buySwaps[0].blockNumber;

        // Block 0 = creation slot through slot+4 (~2.5 seconds) — captures lazy snipers
        const block0Transfers = buySwaps.filter(s => s.blockNumber <= creationSlot + 4);

        // Early transfers = wider context window (~8 seconds)
        const earlyTransfers = buySwaps.filter(s => s.blockNumber <= creationSlot + 20);

        console.log(`[Moralis Solana] Creation slot: ${creationSlot} | Block 0-2 buys: ${block0Transfers.length} | Early buys (0-20): ${earlyTransfers.length}`);

        return {
            holders: normalizeSolanaHolders(holders),
            block0Transfers,
            earlyTransfers,
            creationBlock: creationSlot,
            chain: 'solana',
        };
    } catch (e: any) {
        console.error('[Moralis Solana] Fatal error:', e?.response?.data || e.message);
        return null;
    }
};

/** Normalize Solana holders into standard format */
const normalizeSolanaHolders = (holders: any[]): NormalizedHolder[] => {
    return holders.slice(0, 20).map((h: any) => ({
        address: (h.ownerAddress || '').toLowerCase(),
        balance: parseFloat(h.balanceFormatted || '0'),
        percentage: parseFloat(h.percentageRelativeToTotalSupply || '0'),
        usdValue: parseFloat(h.usdValue || '0'),
    }));
};

// ═══════════════════════════════════════════════
// EVM FORENSICS (Ethereum, BSC, Base, etc.)
// ═══════════════════════════════════════════════

const fetchEvmForensics = async (
    chainId: string,
    tokenAddress: string,
    apiKey: string
): Promise<ForensicData | null> => {
    try {
        const chain = mapChainToMoralisHex(chainId);
        const headers = { 'X-API-Key': apiKey, 'accept': 'application/json' };

        // Parallel fetch: holders + transfers
        const [holdersRes, transfersRes] = await Promise.all([
            axios.get(`${EVM_BASE_URL}/erc20/${tokenAddress}/owners`, {
                params: { chain, limit: 20, order: 'DESC' }, headers,
            }),
            axios.get(`${EVM_BASE_URL}/erc20/${tokenAddress}/transfers`, {
                params: { chain, limit: 100, order: 'ASC' }, headers,
            }),
        ]);

        const rawTransfers = transfersRes.data.result || [];
        const rawHolders = holdersRes.data.result || [];

        // Normalize EVM holders
        const holders: NormalizedHolder[] = rawHolders.slice(0, 20).map((h: any) => ({
            address: (h.owner_address || '').toLowerCase(),
            balance: parseFloat(h.balance || '0') / (10 ** parseInt(h.token_decimals || '18')),
            percentage: parseFloat(h.percentage_relative || h.percentage || '0'),
            usdValue: 0, // EVM endpoint doesn't provide USD value directly
        }));

        // Normalize EVM transfers
        const normalizedTransfers: NormalizedTransfer[] = rawTransfers.map((tx: any) => {
            const decimals = parseInt(tx.token_decimals || '18');
            const tokenAmount = parseFloat(tx.value || '0') / (10 ** decimals);
            return {
                txHash: tx.transaction_hash || '',
                blockNumber: Number(tx.block_number || 0),
                buyerAddress: (tx.to_address || '').toLowerCase(),
                sellerAddress: (tx.from_address || '').toLowerCase(),
                tokenAmount,
                usdValue: 0, // Will be calculated in scanEngine using current price
                transactionType: 'transfer',
            };
        });

        if (normalizedTransfers.length === 0) {
            return { holders, block0Transfers: [], earlyTransfers: [], creationBlock: 0, chain: chainId };
        }

        const creationBlock = normalizedTransfers[0].blockNumber;
        // Launch window = creation block + next 2 blocks (~24-36 seconds on ETH)
        const block0Transfers = normalizedTransfers.filter(t => t.blockNumber <= creationBlock + 2);
        // Early transfers = wider context window
        const earlyTransfers = normalizedTransfers.filter(t => t.blockNumber <= creationBlock + 5);

        console.log(`[Moralis EVM] Creation block: ${creationBlock} | Launch window (0-2): ${block0Transfers.length} | Early (0-5): ${earlyTransfers.length} | Holders: ${holders.length}`);

        return { holders, block0Transfers, earlyTransfers, creationBlock, chain: chainId };
    } catch (e: any) {
        console.error('[Moralis EVM] Forensic scan failed:', e?.response?.data || e.message);
        return null;
    }
};
