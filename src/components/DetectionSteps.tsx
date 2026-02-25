import React from 'react';
import { motion } from 'framer-motion';
import { ScanResult } from '@/lib/mockData';
import { ShieldCheck, AlertTriangle, Zap } from 'lucide-react';

interface DetectionStepsProps {
    data: ScanResult;
}

const StepItem = ({ label, status, delay, icon }: { label: string, status: 'good' | 'bad' | 'neutral', delay: number, icon?: React.ReactNode }) => (
    <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay }}
        className={`flex items-center justify-between p-3 rounded-lg mb-2 border ${status === 'good' ? 'bg-green-500/5 border-green-500/20 text-green-200'
            : status === 'bad' ? 'bg-red-500/5 border-red-500/20 text-red-200'
                : 'bg-blue-500/5 border-blue-500/20 text-blue-200'
            }`}
    >
        <span className="font-medium text-sm flex items-center gap-2">
            {icon}
            {label}
        </span>
    </motion.div>
);

const DetectionSteps: React.FC<DetectionStepsProps> = ({ data }) => {
    const { clusters } = data.analysis;
    const hasBundles = clusters.length > 0;

    // Calculate max risk
    const maxRisk = hasBundles
        ? Math.max(...clusters.map(c => c.risk === 'High' ? 3 : c.risk === 'Moderate' ? 2 : 1))
        : 0;

    // 1. Coordination Check
    let coordLabel = "Coordination Check: Passed (Organic)";
    let coordStatus: 'good' | 'bad' | 'neutral' = 'good';

    if (maxRisk === 3) {
        coordLabel = "High Coordination Detected (Sybil)";
        coordStatus = 'bad';
    } else if (maxRisk === 2) {
        coordLabel = "Suspicious Clustering Found";
        coordStatus = 'neutral';
    }

    // 2. Funding Origin Trace
    const uniqueFunders = data.analysis.clusterCount; // Using cluster count as proxy for distinct funding groups
    const fundingLabel = uniqueFunders > 1 || !hasBundles
        ? `Funding Sources: Distributed (${uniqueFunders || 'Unknown'})`
        : "Funding Source: Single Origin (Centralized)";
    const fundingStatus = (uniqueFunders > 1 || !hasBundles) ? 'good' : 'bad';

    // 3. Synchronized Execution (Heuristic based on block0 volume)
    const hasSyncBuys = data.analysis.block0Volume > 0;
    const syncLabel = hasSyncBuys ? "Execution: Synchronized (Block 0)" : "Execution: Independent";
    const syncStatus = hasSyncBuys ? 'bad' : 'good';

    return (
        <div className="w-full max-w-md mx-auto mb-8">
            <h3 className="text-lg font-semibold mb-4 px-1">Forensic Logic</h3>

            <StepItem
                label={coordLabel}
                status={coordStatus}
                delay={0.1}
                icon={coordStatus === 'bad' ? <Zap size={14} /> : <ShieldCheck size={14} />}
            />

            <StepItem
                label={fundingLabel}
                status={fundingStatus}
                delay={0.2}
                icon={fundingStatus === 'bad' ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
            />

            <StepItem
                label={syncLabel}
                status={syncStatus}
                delay={0.3}
                icon={syncStatus === 'bad' ? <Zap size={14} /> : <ShieldCheck size={14} />}
            />

            <StepItem
                label={data.isLocked ? 'Contract Verified' : 'Contract Unverified'}
                status={data.isLocked ? 'good' : 'neutral'}
                delay={0.4}
            />
        </div>
    );
};

export default DetectionSteps;
