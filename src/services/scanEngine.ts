import { ScanResult, MOCK_SCENARIOS, WalletNode, ScoreFactor, BundleControlResult } from '../lib/mockData';
import { searchAllPairs, mapDexToLiquidityPair } from './dexScreener';
import { checkTokenSecurity } from './goPlus';
import { getTokenForensics, ForensicData, NormalizedTransfer } from './moralisService';
import { traceDistributionTree } from './heliusService';
import { analyzeBundleClusters } from './bundleAnalyzer';

// ───────────────────────────────────────────────
// Zero-address constants (minting transactions)
// ───────────────────────────────────────────────
const ZERO_ADDRESSES = new Set([
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000001',
    '11111111111111111111111111111111',
    '',
]);
const isZeroAddress = (addr: string): boolean => ZERO_ADDRESSES.has(addr);

// ───────────────────────────────────────────────
// MAIN SCAN ENTRY POINT
// ───────────────────────────────────────────────

export const runFullScan = async (query: string): Promise<ScanResult> => {
    // 1. Check demo scenarios
    const normalized = query.toUpperCase().trim();
    if (normalized === 'RUG' || normalized === 'VAMPIRE') return { ...MOCK_SCENARIOS['VAMPIRE'] };
    if (normalized === 'NEST') return { ...MOCK_SCENARIOS['NEST'] };
    if (normalized === 'SAFE') return { ...MOCK_SCENARIOS['SAFE'] };

    // 2. Live Scan
    console.log(`[ScanEngine] Starting live scan for: ${query}`);

    // ── A. Fetch pairs from DexScreener ──
    const allDexPairs = await searchAllPairs(query);
    if (allDexPairs.length === 0) {
        console.warn('[ScanEngine] Token not found on DexScreener.');
        return buildEmptyResult(query);
    }

    const bestPair = allDexPairs[0];
    const allPairsMapped = allDexPairs.map(p => mapDexToLiquidityPair(p));
    const chainId = bestPair.chainId;
    const tokenAddress = bestPair.baseToken.address;
    const priceUsd = parseFloat(bestPair.priceUsd || '0');
    const liquidityUsd = bestPair.liquidity?.usd || 0;
    const fdv = bestPair.fdv || 0;

    console.log(`[ScanEngine] ${allDexPairs.length} pairs on ${chainId}: ${bestPair.baseToken.symbol} | Price: $${priceUsd} | Liq: $${liquidityUsd.toLocaleString()} | FDV: $${fdv.toLocaleString()}`);

    // ── B. Fetch Security Data (GoPlus) ──
    let securityData = null;
    try {
        securityData = await checkTokenSecurity(chainId, tokenAddress);
        console.log('[ScanEngine] GoPlus Security:', securityData);
    } catch (e) {
        console.warn('[ScanEngine] GoPlus check failed, continuing.');
    }

    // ── C. Fetch Forensic Data (Moralis — EVM + Solana) ──
    // Universal env check
    const moralisKey = (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env.VITE_MORALIS_API_KEY
        : process.env.VITE_MORALIS_API_KEY;

    let forensics: ForensicData | null = null;
    let forensicsStatus: 'SUCCESS' | 'MISSING_KEY' | 'NOT_SUPPORTED' | 'ERROR' = 'NOT_SUPPORTED';

    if (!moralisKey) {
        forensicsStatus = 'MISSING_KEY';
    } else {
        try {
            forensics = await getTokenForensics(chainId, tokenAddress);
            if (forensics) {
                forensicsStatus = 'SUCCESS';
                console.log('[ScanEngine] Forensics received:', {
                    chain: forensics.chain,
                    creationBlock: forensics.creationBlock,
                    block0Count: forensics.block0Transfers.length,
                    earlyCount: forensics.earlyTransfers.length,
                    holdersCount: forensics.holders.length,
                });
            } else {
                forensicsStatus = 'NOT_SUPPORTED';
            }
        } catch (e) {
            console.warn('[ScanEngine] Forensics error:', e);
            forensicsStatus = 'ERROR';
        }
    }

    // ── D. Analyze forensic data ──
    const analysisResult = analyzeForensics(forensics, priceUsd, fdv, chainId);

    // ── D2. Deep bundle analysis ──
    // Uses recursive distribution tree tracing: seed buyers → recipients → sub-recipients
    let bundleControl: BundleControlResult | undefined;
    const isSolana = chainId === 'solana';

    // Universal env check for Helius and Alchemy
    const heliusKey = (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env.VITE_HELIUS_API_KEY
        : process.env.VITE_HELIUS_API_KEY;

    const alchemyKey = (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env.VITE_ALCHEMY_API_KEY
        : process.env.VITE_ALCHEMY_API_KEY;

    if (isSolana && heliusKey) {
        // Solana: Trace distribution tree via Helius
        const block0Addresses = [...analysisResult.block0Buyers];
        if (block0Addresses.length > 0) {
            try {
                console.log(`[ScanEngine] Running Helius distribution tree analysis on ${block0Addresses.length} seed wallets...`);
                const walletData = await traceDistributionTree(block0Addresses, tokenAddress);
                const totalSupply = fdv > 0 && priceUsd > 0 ? fdv / priceUsd : 0;

                // Build block0 map for fallback
                const block0BuyMap = new Map<string, number>();
                if (forensics && forensics.block0Transfers) {
                    forensics.block0Transfers.forEach(tx => {
                        if (tx.buyerAddress) {
                            const current = block0BuyMap.get(tx.buyerAddress) || 0;
                            block0BuyMap.set(tx.buyerAddress, current + tx.tokenAmount);
                        }
                    });
                }

                bundleControl = analyzeBundleClusters(walletData, totalSupply, priceUsd, liquidityUsd, block0Addresses, forensics?.holders || [], block0BuyMap);
            } catch (err) {
                console.warn('[ScanEngine] Helius analysis failed:', err);
            }
        }
    }
    else if (!isSolana && alchemyKey) {
        // EVM: Trace distribution tree via Alchemy
        const block0Addresses = [...analysisResult.block0Buyers];
        if (block0Addresses.length > 0) {
            try {
                // Dynamic import to keep Alchemy as an optional dependency
                console.log(`[ScanEngine] Running Alchemy EVM trace on ${block0Addresses.length} seed wallets...`);
                const { traceEvmDistributionTree } = await import('./alchemyService');
                const walletData = await traceEvmDistributionTree(block0Addresses, tokenAddress, chainId);

                const totalSupply = fdv > 0 && priceUsd > 0 ? fdv / priceUsd : 0;

                // Build block0 map
                const block0BuyMap = new Map<string, number>();
                if (forensics && forensics.block0Transfers) {
                    forensics.block0Transfers.forEach(tx => {
                        if (tx.buyerAddress) {
                            const current = block0BuyMap.get(tx.buyerAddress) || 0;
                            block0BuyMap.set(tx.buyerAddress, current + tx.tokenAmount);
                        }
                    });
                }

                bundleControl = analyzeBundleClusters(walletData, totalSupply, priceUsd, liquidityUsd, block0Addresses, forensics?.holders || [], block0BuyMap);
                console.log('[ScanEngine] EVM Bundle analysis complete:', {
                    clusters: bundleControl.clusterCount,
                    risk: bundleControl.overallRisk
                });
            } catch (err) {
                console.warn('[ScanEngine] Alchemy EVM analysis failed:', err);
            }
        }
    }

    // ── E. Build wallet list ──
    const wallets = buildWalletList(forensics, analysisResult.block0Buyers, priceUsd, chainId);

    // ── F. Assemble final analysis ──
    const initialInsiderSupply = wallets.reduce((acc, w) => acc + w.holdingAmount, 0);

    const analysis = {
        totalBundlePercentage: analysisResult.totalBundlePercentage,
        bundleWalletCount: analysisResult.sniperCount,
        holdingConcentration: analysisResult.holdingConcentration,
        liquidityMcapRatio: fdv > 0 ? liquidityUsd / fdv : 0,
        uniqueFundingSources: analysisResult.uniqueFundingSources,
        bundleHoldingsUSD: analysisResult.block0Volume,
        bundleVolumeUSD: analysisResult.bundleVolumeUSD,
        liquidityRiskRatio: liquidityUsd > 0 ? analysisResult.block0Volume / liquidityUsd : 0,

        // Supplementary fields
        clusters: bundleControl?.clusters || [],
        overallRisk: bundleControl?.overallRisk || 'LOW',
        lpValueUSD: liquidityUsd,
        clusterCount: bundleControl?.clusterCount || 0,
        lpImpactRatio: bundleControl?.lpImpactRatio || 0,
        totalBundledSupplyPercent: bundleControl?.totalBundledSupplyPercent || 0,

        // Derived UI fields
        totalBundledTokens: bundleControl?.totalBundledTokens || 0,
        totalBundledValueUSD: bundleControl?.totalBundledValueUSD || 0,
        totalWalletCount: bundleControl?.totalWalletCount || 0,
        statusDistribution: bundleControl?.statusDistribution || { locked: 0, burned: 0, dormant: 0, active: 0 },
        lastUpdated: new Date().toISOString(),

        block0Volume: analysisResult.block0Volume,
        block1Volume: analysisResult.earlyVolume - analysisResult.block0Volume,
        bribeFees: 0,
        initialInsiderSupply,
        totalInsiderSold: 0,
        currentInsiderHoldings: initialInsiderSupply,
        retentionRate: 1.0,
    };

    // Calculate safety score
    const { score, breakdown: scoreBreakdown } = calculateScore(liquidityUsd, securityData, analysis, bundleControl);

    // ── H. Threat type ──
    let threatType: 'ORGANIC_GROWTH' | 'ACCUMULATION_PHASE' | 'DISTRIBUTION_PHASE' | 'UNKNOWN' = 'ORGANIC_GROWTH';
    if (securityData?.is_honeypot) {
        threatType = 'DISTRIBUTION_PHASE';
    } else if (analysisResult.hasBundleCluster) {
        threatType = 'ACCUMULATION_PHASE';
    } else if (analysisResult.sniperCount > 5 && analysisResult.block0Volume > 5000) {
        threatType = 'ACCUMULATION_PHASE';
    } else if (analysisResult.sniperCount > 3) {
        threatType = 'ACCUMULATION_PHASE';
    }

    // ── I. Risk level ──
    let riskLevel: 'SAFE' | 'CAUTION' | 'DANGER' | 'CRITICAL';
    if (score >= 80) riskLevel = 'SAFE';
    else if (score >= 50) riskLevel = 'CAUTION';
    else if (score >= 20) riskLevel = 'DANGER';
    else riskLevel = 'CRITICAL';

    const result: ScanResult = {
        score, riskLevel, threatType, forensicsStatus, scoreBreakdown,
        marketCap: fdv,
        tokenName: bestPair.baseToken.name || bestPair.baseToken.symbol,
        tokenSymbol: bestPair.baseToken.symbol,
        priceUsd, chainId,
        isBurned: securityData ? !securityData.is_mintable : false,
        isLocked: securityData ? !!securityData.is_open_source : false,
        isSoledOld: false,
        pairs: allPairsMapped,
        selectedPair: mapDexToLiquidityPair(bestPair),
        analysis,
        wallets: wallets.length > 0 ? wallets : [
            { address: 'No holder data available', isBundler: false, fundingSource: 'N/A', holdingAmount: 0, percentage: 0 },
        ],
        bundleControl,
    };

    console.log('[ScanEngine] Final Result:', result);
    return result;
};

// ═══════════════════════════════════════════════
// FORENSIC ANALYSIS — Core bundle detection logic
// ═══════════════════════════════════════════════

interface AnalysisResult {
    sniperCount: number;
    block0Volume: number;
    earlyVolume: number;
    bundleVolumeUSD: number;
    totalBundlePercentage: number;
    holdingConcentration: number;
    uniqueFundingSources: number;
    hasBundleCluster: boolean;
    block0Buyers: Set<string>;
}

const analyzeForensics = (
    forensics: ForensicData | null,
    priceUsd: number,
    fdv: number,
    chainId: string
): AnalysisResult => {
    const empty: AnalysisResult = {
        sniperCount: 0, block0Volume: 0, earlyVolume: 0, bundleVolumeUSD: 0,
        totalBundlePercentage: 0, holdingConcentration: 0, uniqueFundingSources: 0,
        hasBundleCluster: false, block0Buyers: new Set(),
    };

    if (!forensics) return empty;

    const isSolana = chainId === 'solana';

    // ─── STEP 1: Identify block-0 buyers and volume ───
    const block0Buyers = new Set<string>();
    let block0Volume = 0;

    forensics.block0Transfers.forEach((tx: NormalizedTransfer) => {
        const buyer = tx.buyerAddress;
        const seller = tx.sellerAddress;

        // For EVM: skip mint transactions (from zero address)
        // For Solana: swaps don't have a seller field, so no need to filter
        if (!isSolana && isZeroAddress(seller)) return;
        if (!buyer || isZeroAddress(buyer)) return;

        block0Buyers.add(buyer);

        // For Solana, use the USD value directly from Moralis
        // For EVM, calculate from token amount * current price
        if (tx.usdValue > 0) {
            block0Volume += tx.usdValue;
        } else {
            block0Volume += tx.tokenAmount * priceUsd;
        }
    });

    // ─── STEP 2: Analyze early transfers ───
    let earlyVolume = 0;
    const earlyBuyers = new Set<string>();
    const fundingSources = new Set<string>();

    forensics.earlyTransfers.forEach((tx: NormalizedTransfer) => {
        const buyer = tx.buyerAddress;
        const seller = tx.sellerAddress;

        if (!isSolana && isZeroAddress(seller)) return;
        if (!buyer || isZeroAddress(buyer)) return;

        earlyBuyers.add(buyer);

        // Track funding sources (for EVM, the seller/sender)
        if (seller && !isZeroAddress(seller)) {
            fundingSources.add(seller);
        }

        if (tx.usdValue > 0) {
            earlyVolume += tx.usdValue;
        } else {
            earlyVolume += tx.tokenAmount * priceUsd;
        }
    });

    // ─── STEP 3: Bundle cluster detection ───
    // For Solana: group by identical block (slot) — many buys in same slot = likely bundled
    // For EVM: group by seller/from_address — same source sending to multiple wallets
    let hasBundleCluster = false;
    let bundleVolumeUSD = block0Volume;

    if (isSolana) {
        // On Solana, a "bundle" is multiple wallets buying in the exact same slot
        // If we see 3+ unique wallets buying in block 0, that's a bundle
        if (block0Buyers.size >= 3) {
            hasBundleCluster = true;
            console.log(`[ScanEngine] Solana bundle cluster: ${block0Buyers.size} unique buyers in creation slot`);
        }

        // Also check for rapid buying in early slots (within ~4 seconds)
        if (!hasBundleCluster && earlyBuyers.size >= 5) {
            hasBundleCluster = true;
            bundleVolumeUSD = earlyVolume;
            console.log(`[ScanEngine] Solana early bundle: ${earlyBuyers.size} unique buyers in early slots`);
        }
    } else {
        // EVM: check if one address distributed tokens to multiple wallets
        const sourceToRecipients: Record<string, Set<string>> = {};
        forensics.earlyTransfers.forEach((tx: NormalizedTransfer) => {
            const seller = tx.sellerAddress;
            const buyer = tx.buyerAddress;
            if (!isZeroAddress(seller) && buyer && !isZeroAddress(buyer)) {
                if (!sourceToRecipients[seller]) sourceToRecipients[seller] = new Set();
                sourceToRecipients[seller].add(buyer);
            }
        });

        for (const [, recipients] of Object.entries(sourceToRecipients)) {
            if (recipients.size >= 3) {
                hasBundleCluster = true;
                break;
            }
        }
    }

    // ─── STEP 4: Holder concentration ───
    let holdingConcentration = 0;
    forensics.holders.forEach(h => {
        holdingConcentration += h.percentage;
    });

    // ─── STEP 5: Bundle percentage ───
    const totalBundlePercentage = fdv > 0 ? (block0Volume / fdv) * 100 : 0;

    // For Solana, if we have no funding source data, use early buyer count
    const uniqueFundingSources = isSolana
        ? earlyBuyers.size   // Each unique buyer in early slots
        : fundingSources.size;

    console.log(`[ScanEngine] Analysis complete | Bundlers: ${block0Buyers.size} | Block0 Vol: $${block0Volume.toFixed(2)} | Early Vol: $${earlyVolume.toFixed(2)} | Sources: ${uniqueFundingSources} | Bundle: ${hasBundleCluster}`);

    return {
        sniperCount: block0Buyers.size,
        block0Volume,
        earlyVolume,
        bundleVolumeUSD: hasBundleCluster ? bundleVolumeUSD : block0Volume,
        totalBundlePercentage,
        holdingConcentration,
        uniqueFundingSources,
        hasBundleCluster,
        block0Buyers,
    };
};

// ═══════════════════════════════════════════════
// WALLET LIST — cross-reference holders with block-0 buyers
// ═══════════════════════════════════════════════

const buildWalletList = (
    forensics: ForensicData | null,
    block0Buyers: Set<string>,
    priceUsd: number,
    chainId: string
): WalletNode[] => {
    if (!forensics || forensics.holders.length === 0) return [];

    const isSolana = chainId === 'solana';

    return forensics.holders.slice(0, 20).map((h, idx) => {
        const address = h.address;
        const isBundler = block0Buyers.has(address);

        // For Solana, use the USD value directly; for EVM, calculate
        const holdingAmount = isSolana
            ? h.usdValue
            : h.balance * priceUsd;

        let fundingSource = 'Unknown';
        if (idx === 0) fundingSource = 'Deployer';
        else if (isBundler) fundingSource = 'Bundle Buyer';

        return {
            address,
            isBundler,
            fundingSource,
            holdingAmount,
            percentage: h.percentage,
        };
    });
};

// ═══════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════

const calculateScore = (
    liquidityUsd: number,
    security: any,
    analysis: any,
    bundleControl?: BundleControlResult
): { score: number; breakdown: ScoreFactor[] } => {
    let score = 100;
    const breakdown: ScoreFactor[] = [];

    // ── Contract Security Checks ──
    if (security?.is_honeypot) {
        breakdown.push({ label: 'Honeypot', impact: -100, status: 'fail', detail: 'Cannot sell — confirmed honeypot' });
        return { score: 0, breakdown };
    }

    if (security?.is_mintable) {
        score -= 25;
        breakdown.push({ label: 'Mintable Supply', impact: -25, status: 'fail', detail: 'Owner can mint new tokens' });
    }

    const buyTax = parseFloat(security?.buy_tax || '0');
    if (buyTax > 10) {
        score -= 15;
        breakdown.push({ label: 'Buy Tax', impact: -15, status: 'fail', detail: `${buyTax.toFixed(1)}% tax on buys` });
    }

    const sellTax = parseFloat(security?.sell_tax || '0');
    if (sellTax > 10) {
        score -= 15;
        breakdown.push({ label: 'Sell Tax', impact: -15, status: 'fail', detail: `${sellTax.toFixed(1)}% tax on sells` });
    }

    if (security?.cannot_sell_all) {
        score -= 30;
        breakdown.push({ label: 'Sell Restriction', impact: -30, status: 'fail', detail: 'Cannot sell entire balance' });
    }

    // ── Liquidity ──
    if (liquidityUsd < 1000) {
        score -= 40;
        breakdown.push({ label: 'Liquidity', impact: -40, status: 'fail', detail: `$${liquidityUsd.toLocaleString()} — critically low` });
    } else if (liquidityUsd < 5000) {
        score -= 25;
        breakdown.push({ label: 'Liquidity', impact: -25, status: 'warn', detail: `$${liquidityUsd.toLocaleString()} — low` });
    } else if (liquidityUsd < 20000) {
        score -= 10;
        breakdown.push({ label: 'Liquidity', impact: -10, status: 'warn', detail: `$${liquidityUsd.toLocaleString()} — moderate` });
    } else {
        breakdown.push({ label: 'Liquidity', impact: 0, status: 'pass', detail: `$${liquidityUsd.toLocaleString()} — healthy` });
    }

    // ── Bundle Activity ──
    if (analysis.bundleWalletCount > 10) {
        score -= 30;
        breakdown.push({ label: 'Bundle Activity', impact: -30, status: 'fail', detail: `${analysis.bundleWalletCount} bundled wallets — heavy coordination` });
    } else if (analysis.bundleWalletCount > 5) {
        score -= 15;
        breakdown.push({ label: 'Bundle Activity', impact: -15, status: 'warn', detail: `${analysis.bundleWalletCount} bundled wallets — moderate coordination` });
    } else if (analysis.bundleWalletCount > 2) {
        score -= 5;
        breakdown.push({ label: 'Bundle Activity', impact: -5, status: 'warn', detail: `${analysis.bundleWalletCount} bundled wallets detected` });
    } else {
        breakdown.push({ label: 'Bundle Activity', impact: 0, status: 'pass', detail: analysis.bundleWalletCount > 0 ? `${analysis.bundleWalletCount} wallet(s) — minimal` : 'No bundle activity detected' });
    }

    // ── Launch Block Volume ──
    if (analysis.block0Volume > 50000) {
        score -= 25;
        breakdown.push({ label: 'Launch Volume', impact: -25, status: 'fail', detail: `$${analysis.block0Volume.toLocaleString()} — massive launch buying` });
    } else if (analysis.block0Volume > 10000) {
        score -= 15;
        breakdown.push({ label: 'Launch Volume', impact: -15, status: 'warn', detail: `$${analysis.block0Volume.toLocaleString()} — high launch buying` });
    } else if (analysis.block0Volume > 5000) {
        score -= 10;
        breakdown.push({ label: 'Launch Volume', impact: -10, status: 'warn', detail: `$${analysis.block0Volume.toLocaleString()} — moderate launch buying` });
    } else {
        breakdown.push({ label: 'Launch Volume', impact: 0, status: 'pass', detail: analysis.block0Volume > 0 ? `$${analysis.block0Volume.toLocaleString()} — low` : 'No launch block activity' });
    }

    // ── Holder Concentration ──
    if (analysis.holdingConcentration > 80) {
        score -= 20;
        breakdown.push({ label: 'Holder Concentration', impact: -20, status: 'fail', detail: `${analysis.holdingConcentration.toFixed(1)}% held by top 20 — very concentrated` });
    } else if (analysis.holdingConcentration > 60) {
        score -= 10;
        breakdown.push({ label: 'Holder Concentration', impact: -10, status: 'warn', detail: `${analysis.holdingConcentration.toFixed(1)}% held by top 20 — concentrated` });
    } else {
        breakdown.push({ label: 'Holder Concentration', impact: 0, status: 'pass', detail: `${analysis.holdingConcentration.toFixed(1)}% held by top 20 — distributed` });
    }

    // ── Deep Bundle Analysis (Helius) ──
    if (bundleControl && bundleControl.clusterCount > 0) {
        // LP Impact Ratio
        if (bundleControl.lpImpactRatio > 1.5) {
            score -= 20;
            breakdown.push({ label: 'LP Impact Ratio', impact: -20, status: 'fail', detail: `${bundleControl.lpImpactRatio}x — bundled value far exceeds LP` });
        } else if (bundleControl.lpImpactRatio > 1.0) {
            score -= 15;
            breakdown.push({ label: 'LP Impact Ratio', impact: -15, status: 'fail', detail: `${bundleControl.lpImpactRatio}x — bundled value exceeds LP` });
        } else if (bundleControl.lpImpactRatio > 0.5) {
            score -= 10;
            breakdown.push({ label: 'LP Impact Ratio', impact: -10, status: 'warn', detail: `${bundleControl.lpImpactRatio}x — significant LP pressure risk` });
        } else {
            breakdown.push({ label: 'LP Impact Ratio', impact: 0, status: 'pass', detail: `${bundleControl.lpImpactRatio}x — manageable LP impact` });
        }

        // Bundled Supply %
        if (bundleControl.totalBundledSupplyPercent > 30) {
            score -= 15;
            breakdown.push({ label: 'Bundled Supply', impact: -15, status: 'fail', detail: `${bundleControl.totalBundledSupplyPercent}% of supply held by bundle clusters` });
        } else if (bundleControl.totalBundledSupplyPercent > 10) {
            score -= 8;
            breakdown.push({ label: 'Bundled Supply', impact: -8, status: 'warn', detail: `${bundleControl.totalBundledSupplyPercent}% of supply in bundle clusters` });
        } else if (bundleControl.totalBundledSupplyPercent > 0) {
            breakdown.push({ label: 'Bundled Supply', impact: 0, status: 'pass', detail: `${bundleControl.totalBundledSupplyPercent}% — low bundled supply` });
        }
    }

    return { score: Math.max(0, Math.min(100, score)), breakdown };
};

// ═══════════════════════════════════════════════
// EMPTY RESULT
// ═══════════════════════════════════════════════

const buildEmptyResult = (query: string): ScanResult => ({
    score: 0, riskLevel: 'CAUTION', threatType: 'UNKNOWN',
    marketCap: 0, tokenName: query, tokenSymbol: '???',
    priceUsd: 0, chainId: 'unknown',
    isBurned: false, isLocked: false, isSoledOld: false,
    pairs: [],
    selectedPair: { dexName: 'N/A', liquidityUSD: 0, pairAddress: '', baseTokenSymbol: '???', quoteTokenSymbol: '???' },
    analysis: {
        totalBundlePercentage: 0, bundleWalletCount: 0, holdingConcentration: 0,
        liquidityMcapRatio: 0, uniqueFundingSources: 0, bundleHoldingsUSD: 0,
        bundleVolumeUSD: 0, liquidityRiskRatio: 0, block0Volume: 0,
        block1Volume: 0, bribeFees: 0, initialInsiderSupply: 0,
        totalInsiderSold: 0, currentInsiderHoldings: 0, retentionRate: 0,
        // Default values for new fields
        clusters: [], overallRisk: 'LOW', lpValueUSD: 0,
        clusterCount: 0, lpImpactRatio: 0, totalBundledSupplyPercent: 0,
        totalBundledTokens: 0, totalBundledValueUSD: 0, totalWalletCount: 0,
        statusDistribution: { locked: 0, burned: 0, dormant: 0, active: 0 },
        lastUpdated: new Date().toISOString(),
    },
    forensicsStatus: 'MISSING_KEY',
    scoreBreakdown: [],
    wallets: [],
});
