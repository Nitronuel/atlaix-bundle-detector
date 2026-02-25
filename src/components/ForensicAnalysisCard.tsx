import React from 'react';
import { ScanResult } from '@/lib/mockData';
import { Zap, ShieldCheck, AlertTriangle, Users, GitMerge, Clock } from 'lucide-react';

interface ForensicAnalysisCardProps {
    data: ScanResult;
}

const ForensicAnalysisCard: React.FC<ForensicAnalysisCardProps> = ({ data }) => {
    const { analysis, forensicsStatus } = data;

    // Calculate maximum risk score from all clusters
    const maxRiskScore = analysis.clusters.length > 0
        ? Math.max(...analysis.clusters.map(c => c.risk === 'High' ? 85 : c.risk === 'Moderate' ? 50 : 10))
        : 0;

    const isHighRisk = maxRiskScore >= 60;
    const isMediumRisk = maxRiskScore >= 30 && maxRiskScore < 60;

    // Header styling
    const headerColor = isHighRisk ? 'text-red-500' : isMediumRisk ? 'text-orange-500' : 'text-green-500';
    const borderColor = isHighRisk ? 'border-red-500/50 bg-red-950/10' : isMediumRisk ? 'border-orange-500/50 bg-orange-950/10' : 'border-green-500/30';
    const headerIcon = isHighRisk ? <Zap size={24} /> : isMediumRisk ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />;

    let headerTitle = "ORGANIC DISTRIBUTION";
    let headerSubtitle = "Reflexive Dispersion Detect";

    if (isHighRisk) {
        headerTitle = "COORDINATED SYBIL ATTACK";
        headerSubtitle = "High Confirmation of Central Control";
    } else if (isMediumRisk) {
        headerTitle = "SUSPICIOUS CLUSTERING";
        headerSubtitle = "Probable Coordinated Entity";
    }

    const getForensicDisplay = (value: number, type: 'currency' | 'number') => {
        if (forensicsStatus === 'SUCCESS') {
            return type === 'currency' ? `$${value.toLocaleString()}` : value.toString();
        }
        if (forensicsStatus === 'MISSING_KEY') return "API KEY MISSING";
        if (forensicsStatus === 'NOT_SUPPORTED') return "UNSUPPORTED CHAIN";
        return "DATA ERROR";
    };

    const isForensicsError = forensicsStatus !== 'SUCCESS';

    return (
        <div className={`bg-card/50 border rounded-2xl p-6 mt-8 ${borderColor}`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isHighRisk ? 'bg-red-500/20 text-red-500' : isMediumRisk ? 'bg-orange-500/20 text-orange-500' : 'bg-green-500/10 text-green-500'}`}>
                        {headerIcon}
                    </div>
                    <div>
                        <h3 className={`text-xl font-bold ${headerColor}`}>
                            {headerTitle}
                        </h3>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            {headerSubtitle}
                        </p>
                    </div>
                </div>

                {/* Coordination Score Badge */}
                <div className={`px-4 py-2 rounded-lg border ${borderColor} flex flex-col items-end`}>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Coordination Score</span>
                    <span className={`text-2xl font-black ${headerColor}`}>{maxRiskScore}/100</span>
                </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">

                {/* Metric 1: Funding Sources */}
                <div className="bg-secondary/30 p-3 rounded-lg border border-border/50 relative overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                        <GitMerge size={14} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Funding Sources</span>
                    </div>
                    <span className={`text-foreground font-mono font-bold block ${isForensicsError ? 'text-xs text-yellow-500 mt-1' : ''}`}>
                        {analysis.lpValueUSD > 0 ? analysis.clusterCount : '0'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        {analysis.clusterCount > 1 ? "Multiple origins (Good)" : "Single origin (High Risk)"}
                    </span>
                </div>

                {/* Metric 2: Bundled Wallets */}
                <div className="bg-secondary/30 p-3 rounded-lg border border-border/50 relative overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Linked Wallets</span>
                    </div>
                    <span className={`text-foreground font-mono font-bold block ${isForensicsError ? 'text-xs text-yellow-500 mt-1' : ''}`}>
                        {getForensicDisplay(analysis.bundleWalletCount, 'number')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        {analysis.totalBundlePercentage.toFixed(1)}% of supply
                    </span>
                </div>

                {/* Metric 3: Sync Events */}
                <div className="bg-secondary/30 p-3 rounded-lg border border-border/50 relative overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                        <Clock size={14} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Early Buyers</span>
                    </div>
                    <span className={`text-foreground font-mono font-bold block ${isForensicsError ? 'text-xs text-yellow-500 mt-1' : ''}`}>
                        {analysis.block0Volume > 0 ? "YES" : "NO"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        Block 0 Sniping
                    </span>
                </div>
            </div>

            {/* Detailed Risk Signals (only if meaningful) */}
            {(isHighRisk || isMediumRisk) && (
                <div className="mb-6 p-4 bg-background/50 rounded-xl border border-border/50">
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Detected Risk Signals</h4>

                    <div className="space-y-2">
                        {analysis.clusterCount > 0 && maxRiskScore > 30 && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <GitMerge size={14} className="text-red-400" /> Shared Funding Source
                                </span>
                                <span className="text-red-400 font-bold">+35 Risk</span>
                            </div>
                        )}

                        {analysis.block0Volume > 0 && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Zap size={14} className="text-orange-400" /> Block 0 Execution
                                </span>
                                <span className="text-orange-400 font-bold">+20 Risk</span>
                            </div>
                        )}

                        {analysis.totalBundlePercentage > 20 && (
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Users size={14} className="text-red-400" /> Heavy Supply Control ({analysis.totalBundlePercentage.toFixed(0)}%)
                                </span>
                                <span className="text-red-400 font-bold">+25 Risk</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForensicAnalysisCard;
