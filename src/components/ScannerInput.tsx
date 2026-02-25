import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface ScannerInputProps {
    onScan: (address: string) => void;
    isLoading: boolean;
}

const ScannerInput: React.FC<ScannerInputProps> = ({ onScan, isLoading }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onScan(input.trim());
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto mb-8">
            <form onSubmit={handleSubmit} className="relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter Token Address"
                    className="w-full pl-12 pr-4 py-4 bg-secondary/50 border border-border rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground text-lg"
                    disabled={isLoading}
                />
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="absolute right-2 top-2 bottom-2 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? 'Scanning...' : 'Scan'}
                </button>
            </form>
        </div>
    );
};

export default ScannerInput;
