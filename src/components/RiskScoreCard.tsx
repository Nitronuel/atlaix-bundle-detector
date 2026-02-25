import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ShieldCheck, Skull, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { getRiskColor, getRiskLabel } from '@/lib/analyzer';
import { ScoreFactor } from '@/lib/mockData';

interface RiskScoreCardProps {
    score: number;
    breakdown?: ScoreFactor[];
}

const RiskScoreCard: React.FC<RiskScoreCardProps> = ({ score, breakdown = [] }) => {
    const riskLabel = getRiskLabel(score);
    const colorClass = getRiskColor(score);

    const getIcon = () => {
        if (score >= 80) return <ShieldCheck className="w-14 h-14 text-green-500" />;
        if (score >= 50) return <AlertTriangle className="w-14 h-14 text-yellow-500" />;
        return <Skull className="w-14 h-14 text-red-500" />;
    };

    const getStatusIcon = (status: ScoreFactor['status']) => {
        switch (status) {
            case 'pass': return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
            case 'fail': return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
            case 'warn': return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
            case 'info': return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
        }
    };

    const getImpactColor = (impact: number) => {
        if (impact === 0) return 'text-green-500';
        if (impact >= -10) return 'text-yellow-500';
        return 'text-red-500';
    };

    const getStatusBg = (status: ScoreFactor['status']) => {
        switch (status) {
            case 'pass': return 'border-green-500/20 bg-green-500/5';
            case 'fail': return 'border-red-500/20 bg-red-500/5';
            case 'warn': return 'border-yellow-500/20 bg-yellow-500/5';
            case 'info': return 'border-blue-500/20 bg-blue-500/5';
        }
    };

    // Separate passing and failing/warning factors  
    const penalties = breakdown.filter(f => f.impact < 0);
    const passed = breakdown.filter(f => f.impact === 0);

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl shadow-lg mb-8 overflow-hidden"
        >
            <div className={`flex flex-col ${breakdown.length > 0 ? 'md:flex-row' : ''}`}>
                {/* ── LEFT: Score Circle ── */}
                <div className={`p-8 text-center flex flex-col items-center justify-center ${breakdown.length > 0 ? 'md:w-2/5 md:border-r md:border-border/50' : 'w-full'}`}>
                    <div className="mb-3">
                        {getIcon()}
                    </div>
                    <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-1">Safety Score</h2>
                    <div className={`text-6xl font-black mb-2 ${colorClass}`}>
                        {score}<span className="text-3xl text-muted-foreground">/100</span>
                    </div>
                    <div className={`text-xl font-bold tracking-tight px-4 py-1 rounded-full inline-block bg-secondary ${colorClass}`}>
                        {riskLabel}
                    </div>

                    {/* Mini summary */}
                    {breakdown.length > 0 && (
                        <div className="mt-4 text-xs text-muted-foreground">
                            {penalties.length === 0 ? (
                                <span className="text-green-400">All checks passed</span>
                            ) : (
                                <span className="text-yellow-400">{penalties.length} issue{penalties.length > 1 ? 's' : ''} found</span>
                            )}
                            {' · '}
                            {passed.length} passed
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Score Breakdown ── */}
                {breakdown.length > 0 && (
                    <div className="md:w-3/5 p-5">
                        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
                            Score Breakdown
                        </h3>
                        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                            {/* Show penalties first, then passes */}
                            {[...penalties, ...passed].map((factor, idx) => (
                                <motion.div
                                    key={factor.label}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${getStatusBg(factor.status)} transition-all hover:brightness-110`}
                                >
                                    {getStatusIcon(factor.status)}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-foreground truncate">
                                                {factor.label}
                                            </span>
                                            <span className={`text-xs font-mono font-bold flex-shrink-0 ${getImpactColor(factor.impact)}`}>
                                                {factor.impact === 0 ? '+0' : factor.impact}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                                            {factor.detail}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default RiskScoreCard;
