import axios from 'axios';

// GoPlus Public API (Free tier has rate limits, but sufficient for testing)
const BASE_URL = 'https://api.gopluslabs.io/api/v1';

export interface SecurityData {
    is_honeypot: boolean;
    is_mintable: boolean;
    owner_address: string;
    is_open_source: boolean;
    buy_tax: string;
    sell_tax: string;
    cannot_sell_all: boolean;
    is_proxy: boolean;
    slippage_modifiable: boolean;
}

export const checkTokenSecurity = async (chainId: string, tokenAddress: string): Promise<SecurityData | null> => {
    try {
        // Map common chain IDs to GoPlus IDs
        // 1 = ETH, 56 = BSC, 8453 = Base, 137 = Polygon, solana = solana
        let goPlusChainId = '1';
        if (chainId === 'bsc') goPlusChainId = '56';
        if (chainId === 'base') goPlusChainId = '8453';
        if (chainId === 'solana') goPlusChainId = 'solana';

        const response = await axios.get(`${BASE_URL}/token_security/${goPlusChainId}?contract_addresses=${tokenAddress}`);

        const result = response.data.result;
        if (!result || !result[tokenAddress.toLowerCase()]) return null;

        const data = result[tokenAddress.toLowerCase()];

        return {
            is_honeypot: data.is_honeypot === "1",
            is_mintable: data.is_mintable === "1",
            owner_address: data.owner_address,
            is_open_source: data.is_open_source === "1",
            buy_tax: String(parseFloat(data.buy_tax || "0") * 100),
            sell_tax: String(parseFloat(data.sell_tax || "0") * 100),
            cannot_sell_all: data.cannot_sell_all === "1",
            is_proxy: data.is_proxy === "1",
            slippage_modifiable: data.slippage_modifiable === "1"
        };

    } catch (error) {
        console.error("GoPlus API Error:", error);
        return null;
    }
};
