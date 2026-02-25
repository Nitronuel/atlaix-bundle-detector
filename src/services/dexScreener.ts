import axios from 'axios';
import { LiquidityPair } from '../lib/mockData';

const BASE_URL = 'https://api.dexscreener.com/latest/dex';

export interface DexPairData {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    quoteToken: {
        address: string;
        name: string;
        symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
        m5: { buys: number; sells: number };
        h1: { buys: number; sells: number };
        h6: { buys: number; sells: number };
        h24: { buys: number; sells: number };
    };
    volume: {
        h24: number;
        h6: number;
        h1: number;
        m5: number;
    };
    priceChange: {
        m5: number;
        h1: number;
        h6: number;
        h24: number;
    };
    liquidity: {
        usd: number;
        base: number;
        quote: number;
    };
    fdv: number;
    paircreatedAt: number;
}

// Returns ALL pairs for a token, sorted by liquidity (highest first)
export const searchAllPairs = async (query: string): Promise<DexPairData[]> => {
    try {
        // 1. Try searching as token address
        let response = await axios.get(`${BASE_URL}/tokens/${query}`);
        let pairs = response.data.pairs as DexPairData[];

        if (!pairs || pairs.length === 0) {
            // 2. Try searching as text (symbol/name)
            response = await axios.get(`${BASE_URL}/search?q=${query}`);
            pairs = response.data.pairs as DexPairData[];
        }

        if (!pairs || pairs.length === 0) return [];

        // 3. Sort by liquidity USD descending — highest liquidity first
        pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

        console.log(`[DexScreener] Found ${pairs.length} pairs. Top: ${pairs[0].dexId} ($${pairs[0].liquidity?.usd?.toLocaleString()})`);
        return pairs;
    } catch (error) {
        console.error("DexScreener API Error:", error);
        return [];
    }
};

// Legacy alias: returns only the highest-liquidity pair
export const searchToken = async (query: string): Promise<DexPairData | null> => {
    const pairs = await searchAllPairs(query);
    return pairs.length > 0 ? pairs[0] : null;
};

export const mapDexToLiquidityPair = (dexData: DexPairData): LiquidityPair => {
    return {
        dexName: dexData.dexId,
        liquidityUSD: dexData.liquidity?.usd || 0,
        pairAddress: dexData.pairAddress,
        baseTokenSymbol: dexData.baseToken.symbol,
        quoteTokenSymbol: dexData.quoteToken.symbol
    };
};
