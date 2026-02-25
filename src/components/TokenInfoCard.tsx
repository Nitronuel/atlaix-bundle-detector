import React from 'react';
import { motion } from 'framer-motion';
import { ScanResult } from '@/lib/mockData';
import { Coins, TrendingUp, Droplets, Shield, Flame, Lock, Unlock, ExternalLink } from 'lucide-react';

interface TokenInfoCardProps {
    data: ScanResult;
}

const chainLogos: Record<string, string> = {
    ethereum: '⟠',
    bsc: '🟡',
    base: '🔵',
    solana: '◎',
    arbitrum: '🔷',
    polygon: '🟣',
    avalanche: '🔺',
};

const formatPrice = (price: number): string => {
    if (price === 0) return '$0';
    if (price < 0.000001) return `$${price.toExponential(2)}`;
    if (price < 0.01) return `$${price.toFixed(8)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    if (price < 1000) return `$${price.toFixed(2)}`;
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const formatLargeNumber = (num: number): string => {
    if (num === 0) return '$0';
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
};

const TokenInfoCard: React.FC<TokenInfoCardProps> = ({ data }) => {
    const chainEmoji = chainLogos[data.chainId] || '🔗';
    const pairUrl = data.selectedPair.pairAddress
        ? `https://dexscreener.com/${data.chainId}/${data.selectedPair.pairAddress}`
        : null;

    return (
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 mb-6 overflow-hidden relative"
        >
            {/* Subtle gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-purple-500" />

            {/* Top Row: Name + Chain */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-xl font-black text-primary">
                        {data.tokenSymbol.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-foreground leading-tight">
                            {data.tokenName}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm font-mono text-muted-foreground">${data.tokenSymbol}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                                {chainEmoji} {data.chainId}
                            </span>
                        </div>
                    </div>
                </div>

                {pairUrl && (
                    <a
                        href={pairUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 hover:border-primary/40"
                    >
                        <ExternalLink size={12} />
                        DexScreener
                    </a>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Price */}
                <div className="bg-secondary/40 rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp size={12} className="text-green-400" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Price</span>
                    </div>
                    <span className="text-lg font-mono font-bold text-foreground">
                        {formatPrice(data.priceUsd)}
                    </span>
                </div>

                {/* Market Cap */}
                <div className="bg-secondary/40 rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Coins size={12} className="text-yellow-400" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Market Cap</span>
                    </div>
                    <span className="text-lg font-mono font-bold text-foreground">
                        {formatLargeNumber(data.marketCap)}
                    </span>
                </div>

                {/* Liquidity */}
                <div className="bg-secondary/40 rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Droplets size={12} className="text-blue-400" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Liquidity</span>
                    </div>
                    <span className="text-lg font-mono font-bold text-foreground">
                        {formatLargeNumber(data.selectedPair.liquidityUSD)}
                    </span>
                </div>

                {/* Security Status */}
                <div className="bg-secondary/40 rounded-xl p-3 border border-border/50">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Shield size={12} className="text-purple-400" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Security</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            {data.isBurned ? (
                                <Flame size={13} className="text-green-400" />
                            ) : (
                                <Flame size={13} className="text-red-400" />
                            )}
                            <span className={`text-xs font-medium ${data.isBurned ? 'text-green-400' : 'text-red-400'}`}>
                                {data.isBurned ? 'Non-Mintable' : 'Mintable'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {data.isLocked ? (
                                <Lock size={13} className="text-green-400" />
                            ) : (
                                <Unlock size={13} className="text-yellow-400" />
                            )}
                            <span className={`text-xs font-medium ${data.isLocked ? 'text-green-400' : 'text-yellow-400'}`}>
                                {data.isLocked ? 'Verified' : 'Unverified'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pair Info */}
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground bg-secondary/20 rounded-lg px-3 py-2 border border-border/30">
                <span>
                    Pair: <span className="font-mono text-foreground">{data.selectedPair.baseTokenSymbol}/{data.selectedPair.quoteTokenSymbol}</span> on {data.selectedPair.dexName}
                </span>
                {data.pairs.length > 1 && (
                    <span className="text-primary">{data.pairs.length} pairs found</span>
                )}
            </div>
        </motion.div>
    );
};

export default TokenInfoCard;
