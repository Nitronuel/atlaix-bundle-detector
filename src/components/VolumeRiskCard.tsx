import React from 'react';
import { motion } from 'framer-motion';
import { ScanResult } from '@/lib/mockData';
import { Droplets, CheckCircle2 } from 'lucide-react';

interface VolumeRiskCardProps {
    data: ScanResult;
}

const VolumeRiskCard: React.FC<VolumeRiskCardProps> = ({ data }) => {
    // 1. Prefer Helius bundle data if available (most accurate)
    // 2. Fall back to Moralis bundleVolumeUSD
    // 3. Last resort: block0Volume
    let riskVolume = 0;
    if (data.bundleControl) {
        riskVolume = data.bundleControl.totalBundledValueUSD;
    } else {
        riskVolume = data.analysis.bundleHoldingsUSD > 0 ? data.analysis.bundleHoldingsUSD : data.analysis.bundleVolumeUSD;
    }

    const liquidity = data.selectedPair.liquidityUSD;
    const noBundleData = riskVolume === 0;

    if (noBundleData) {
        // No bundle activity — show a clean summary instead of empty bars
        return (
            <div className="bg-card/50 p-6 rounded-2xl border border-border mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        Volume Drain Risk
                    </h3>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-500">
                        LOW RISK
                    </span>
                </div>

                <div className="flex items-center gap-3 p-4 bg-green-500/5 rounded-lg border border-green-500/20">
                    <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
                    <div>
                        <p className="text-sm text-foreground font-medium">No bundle activity detected</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Liquidity Pool: <span className="font-mono font-bold text-blue-400">${liquidity.toLocaleString()}</span>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Has bundle data — show full comparison bars
    const maxVal = Math.max(riskVolume, liquidity);
    const riskWidth = (riskVolume / maxVal) * 100;
    const liquidityWidth = (liquidity / maxVal) * 100;

    const ratio = (riskVolume / liquidity).toFixed(1);
    const isCritical = riskVolume > liquidity;
    const isHighRisk = riskVolume > liquidity * 0.5;

    return (
        <div className="bg-card/50 p-6 rounded-2xl border border-border mt-8">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    Volume Drain Risk
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${isCritical ? 'bg-red-500/20 text-red-500' : isHighRisk ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
                    {isCritical ? "CRITICAL RISK" : isHighRisk ? "HIGH RISK" : "LOW RISK"}
                </span>
            </div>

            <div className="space-y-6">
                {/* Risk Volume Bar */}
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Bundle Holdings</span>
                        <span className="font-mono font-bold text-red-400">${riskVolume.toLocaleString()}</span>
                    </div>
                    <div className="h-4 bg-secondary rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${riskWidth}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-red-500 rounded-full"
                        />
                    </div>
                </div>

                {/* Liquidity Bar */}
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground flex items-center gap-1"><Droplets size={12} /> Liquidity Pool</span>
                        <span className="font-mono font-bold text-blue-400">${liquidity.toLocaleString()}</span>
                    </div>
                    <div className="h-4 bg-secondary rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${liquidityWidth}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-blue-500 rounded-full"
                        />
                    </div>
                </div>
            </div>

            <div className="mt-6 p-4 bg-secondary/30 rounded-lg text-sm">
                <p className="text-muted-foreground">
                    Current Drain Ratio: <span className="text-foreground font-bold">{ratio}x</span>
                </p>
                <p className={`mt-1 ${isCritical ? 'text-red-400' : 'text-green-400'}`}>
                    {isCritical
                        ? "⚠️ Bundlers hold more value than the entire liquidity pool. They can drain it to ZERO instantly."
                        : "✅ Liquidity is sufficient to absorb bundle selling."}
                </p>
            </div>
        </div>
    );
};

export default VolumeRiskCard;
