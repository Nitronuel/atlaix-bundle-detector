import { useState } from 'react';
import { BundleControlResult, BundleWallet } from '@/lib/mockData';
import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Shield, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react';

interface BundleControlCardProps {
    data: BundleControlResult;
}

const formatUSD = (v: number): string => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
};

const formatTokens = (v: number): string => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(2);
};

const shortenAddr = (addr: string): string =>
    addr.length > 12 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
    CRITICAL: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    HIGH: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    MODERATE: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    LOW: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
};

const clusterRiskColors: Record<string, string> = {
    High: 'text-red-400',
    Moderate: 'text-yellow-400',
    Low: 'text-green-400',
};

const RiskIcon = ({ risk }: { risk: string }) => {
    if (risk === 'CRITICAL' || risk === 'HIGH') return <ShieldAlert className="w-5 h-5" />;
    if (risk === 'MODERATE') return <AlertTriangle className="w-5 h-5" />;
    return <ShieldCheck className="w-5 h-5" />;
};

export default function BundleControlCard({ data }: BundleControlCardProps) {
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
    const rc = riskColors[data.overallRisk] || riskColors.LOW;

    const timeSinceUpdate = () => {
        const diff = Date.now() - new Date(data.lastUpdated).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        return `${mins}m ago`;
    };

    const { locked, burned, dormant, active } = data.statusDistribution;
    const totalStatus = locked + burned + dormant + active || 1;

    return (
        <div className="mt-8 bg-card/50 rounded-2xl border border-border overflow-hidden">
            {/* ── Header ── */}
            <div className="p-6 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                    <h2 className="text-xl font-bold tracking-tight">
                        <span className="text-foreground">Bundle Detection</span>
                        <span className="text-muted-foreground font-normal"> & Supply Control Analysis</span>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Analyzes clustered holder behavior and concentration risk relative to liquidity depth.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                    <span>Last Updated: {timeSinceUpdate()}</span>
                    <RefreshCw className="w-3.5 h-3.5" />
                </div>
            </div>

            {/* ── Risk Banner ── */}
            <div className={`mx-6 mb-6 rounded-xl ${rc.bg} border ${rc.border} p-4`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 justify-center text-sm">
                    <div className={`flex items-center gap-2 font-bold ${rc.text}`}>
                        <RiskIcon risk={data.overallRisk} />
                        Overall Bundle Risk: <span className="text-base">{data.overallRisk}</span>
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-border" />
                    <div className="text-muted-foreground">
                        Bundled Supply: <span className={`font-semibold ${rc.text}`}>{data.totalBundledSupplyPercent}%</span> of Total Supply
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-border" />
                    <div className="text-muted-foreground">
                        LP Impact Ratio: <span className={`font-semibold ${rc.text}`}>{data.lpImpactRatio}x</span> Liquidity Depth
                    </div>
                </div>
                {data.lpImpactRatio > 1 && (
                    <p className={`text-center text-xs mt-2 ${rc.text} opacity-80`}>
                        Bundled value exceeds current liquidity pool.
                    </p>
                )}
            </div>

            {/* ── 4 Summary Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 mb-6">
                {/* Total Bundled Supply */}
                <div className="bg-background/50 rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Total Bundled Supply</p>
                    <p className="text-2xl font-bold text-foreground">{data.totalBundledSupplyPercent}%</p>
                    <div className="w-full h-1 bg-border rounded-full mt-2 mb-1.5 overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{
                                width: `${Math.min(data.totalBundledSupplyPercent, 100)}%`,
                                background: data.totalBundledSupplyPercent > 30 ? '#ef4444' : data.totalBundledSupplyPercent > 15 ? '#eab308' : '#22c55e',
                            }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">{formatTokens(data.totalBundledTokens)} TOK</p>
                    <p className="text-xs text-muted-foreground">{formatUSD(data.totalBundledValueUSD)}</p>
                </div>

                {/* Bundle Clusters */}
                <div className="bg-background/50 rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Bundle Clusters</p>
                    <div className="flex items-baseline gap-3">
                        <p className="text-2xl font-bold text-foreground">{data.clusterCount}</p>
                        <span className="text-sm text-muted-foreground">Clusters</span>
                    </div>
                    <div className="flex items-baseline gap-3 mt-1">
                        <p className="text-2xl font-bold text-foreground">{data.totalWalletCount}</p>
                        <span className="text-sm text-muted-foreground">Wallets</span>
                    </div>
                </div>

                {/* Liquidity Comparison */}
                <div className="bg-background/50 rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Liquidity Comparison</p>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">LP Value:</span>
                            <span className="font-semibold text-foreground">{formatUSD(data.lpValueUSD)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Bundled:</span>
                            <span className="font-semibold text-foreground">{formatUSD(data.totalBundledValueUSD)}</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-1.5">
                            <span className="text-muted-foreground">Impact:</span>
                            <span className={`font-bold ${data.lpImpactRatio > 1 ? 'text-red-400' : data.lpImpactRatio > 0.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                                {data.lpImpactRatio}x
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-background/50 rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Status Distribution</p>
                    <div className="flex h-3 rounded-full overflow-hidden bg-border mb-3">
                        {locked > 0 && <div className="bg-emerald-500" style={{ width: `${(locked / totalStatus) * 100}%` }} />}
                        {burned > 0 && <div className="bg-amber-500" style={{ width: `${(burned / totalStatus) * 100}%` }} />}
                        {dormant > 0 && <div className="bg-rose-400" style={{ width: `${(dormant / totalStatus) * 100}%` }} />}
                        {active > 0 && <div className="bg-blue-500" style={{ width: `${(active / totalStatus) * 100}%` }} />}
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Locked <span className="text-muted-foreground ml-auto">{locked}</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Burned <span className="text-muted-foreground ml-auto">{burned}</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Dormant <span className="text-muted-foreground ml-auto">{dormant}</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Active <span className="text-muted-foreground ml-auto">{active}</span></div>
                    </div>
                </div>
            </div>

            {/* ── Cluster Table ── */}
            {data.clusters.length > 0 && (
                <div className="px-6 pb-6">
                    <div className="border border-border rounded-xl overflow-x-auto">
                        <div className="min-w-[600px]">
                            {/* Table Header */}
                            <div className="grid grid-cols-7 gap-2 px-4 py-3 bg-background/60 text-xs font-medium text-muted-foreground border-b border-border">
                                <span>Cluster</span>
                                <span>Wallets</span>
                                <span>Supply %</span>
                                <span>USD Value</span>
                                <span>Status</span>
                                <span>LP Impact</span>
                                <span>Risk</span>
                            </div>

                            {/* Table Rows */}
                            {data.clusters.map((cluster) => (
                                <div key={cluster.id}>
                                    <div
                                        className="grid grid-cols-7 gap-2 px-4 py-3 text-sm border-b border-border/50 hover:bg-background/30 cursor-pointer transition-colors"
                                        onClick={() => setExpandedCluster(expandedCluster === cluster.id ? null : cluster.id)}
                                    >
                                        <span className="font-medium text-foreground">{cluster.id}</span>
                                        <span className="text-muted-foreground">{cluster.wallets.length} Wallets</span>
                                        <span className="font-semibold text-foreground">{cluster.totalSupplyPercent}%</span>
                                        <span className="font-semibold text-foreground">{formatUSD(cluster.totalValueUSD)}</span>
                                        <span className="text-muted-foreground text-xs">{cluster.status}</span>
                                        <span className={`font-semibold ${cluster.lpImpact >= 0.8 ? 'text-red-400' : cluster.lpImpact >= 0.3 ? 'text-yellow-400' : 'text-green-400'}`}>
                                            {cluster.lpImpact}x
                                        </span>
                                        <span className={`font-bold ${clusterRiskColors[cluster.risk] || 'text-muted-foreground'}`}>
                                            {cluster.risk}
                                        </span>
                                    </div>

                                    {/* Expanded Wallet Details */}
                                    {expandedCluster === cluster.id && (
                                        <div className="bg-background/40 border-b border-border p-4">
                                            <p className="text-xs font-medium text-muted-foreground mb-3">
                                                Wallet Details — {cluster.id}
                                            </p>
                                            <div className="space-y-2">
                                                {cluster.wallets.map((w) => (
                                                    <WalletRow key={w.address} wallet={w} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* View Details Toggle */}
                    <button
                        className="flex items-center gap-1.5 text-sm text-primary mt-3 hover:underline"
                        onClick={() => setExpandedCluster(expandedCluster ? null : data.clusters[0]?.id)}
                    >
                        {expandedCluster ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {expandedCluster ? 'Collapse Details' : 'View Details'}
                    </button>
                </div>
            )}

            {data.clusters.length === 0 && (
                <div className="px-6 pb-6">
                    <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                        <Shield className="w-5 h-5 text-green-400" />
                        <p className="text-sm text-green-400">No bundle clusters detected at launch. Token distribution appears organic.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Wallet Row Sub-Component ──

function WalletRow({ wallet }: { wallet: BundleWallet }) {
    const isSeed = wallet.boughtAmount > 0 && wallet.receivedAmount === 0;
    const isTransfer = wallet.receivedAmount > 0;

    // Status badges
    const getStatusBadge = () => {
        switch (wallet.status) {
            case 'active': return <span className="px-1.5 py-0.5 rounded-sm bg-blue-500/20 text-blue-400 text-[10px] font-bold">ACTIVE</span>;
            case 'dormant': return <span className="px-1.5 py-0.5 rounded-sm bg-rose-500/20 text-rose-400 text-[10px] font-bold">DORMANT</span>;
            case 'sold_all': return <span className="px-1.5 py-0.5 rounded-sm bg-gray-500/20 text-gray-400 text-[10px] font-bold">SOLD ALL</span>;
            default: return null;
        }
    };

    return (
        <div className="grid grid-cols-12 gap-2 items-center text-xs bg-background/30 hover:bg-background/50 transition-colors rounded-lg px-3 py-2 border border-border/30">
            {/* 1. Wallet Address & Type */}
            <div className="col-span-3 flex items-center gap-2">
                <div className="flex flex-col">
                    <a
                        href={`https://solscan.io/account/${wallet.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-blue-400 hover:text-blue-300 hover:underline transition-colors flex items-center gap-1"
                    >
                        {shortenAddr(wallet.address)}
                        <ExternalLink size={10} />
                    </a>
                    <div className="flex gap-1 mt-0.5">
                        {isSeed && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 rounded">SEED</span>}
                        {isTransfer && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded">SUB</span>}
                    </div>
                </div>
            </div>

            {/* 2. Status */}
            <div className="col-span-2">
                {getStatusBadge()}
            </div>

            {/* 3. Holding (Moved) */}
            <div className="col-span-3 flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase">Current Hold</span>
                <span className={`font-mono font-bold ${wallet.currentBalance > 0 ? 'text-white' : 'text-gray-500'}`}>
                    {formatTokens(wallet.currentBalance)}
                </span>
                {wallet.holdingUSD > 0 && (
                    <span className="text-[10px] text-green-400 opacity-80">
                        {formatUSD(wallet.holdingUSD)}
                    </span>
                )}
            </div>

            {/* 4. In (Buy/Receive) */}
            <div className="col-span-2 flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase">In</span>
                {wallet.boughtAmount > 0 && (
                    <span className="text-green-400 font-medium">+{formatTokens(wallet.boughtAmount)} (Buy)</span>
                )}
                {wallet.receivedAmount > 0 && (
                    <span className="text-indigo-400 font-medium">+{formatTokens(wallet.receivedAmount)} (Rcv)</span>
                )}
                {wallet.boughtAmount === 0 && wallet.receivedAmount === 0 && <span className="text-muted-foreground">-</span>}
            </div>

            {/* 5. Out (Sold) */}
            <div className="col-span-2 flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase">Out</span>
                <span className={`${wallet.soldAmount > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {wallet.soldAmount > 0 ? `-${formatTokens(wallet.soldAmount)}` : '-'}
                </span>
            </div>
        </div>
    );
}
